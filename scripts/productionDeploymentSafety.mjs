import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export const PRODUCTION_PROJECT_ID = 'misechef-fa4bf';
export const PRODUCTION_SITE_ID = 'misechef-fa4bf';
export const PRODUCTION_STORAGE_BUCKET = 'misechef-fa4bf.firebasestorage.app';
export const PRODUCTION_ORIGIN = 'https://misechef.ai';
export const PRODUCTION_DEFAULT_ORIGIN = 'https://misechef-fa4bf.web.app';
export const PINNED_FIREBASE_CLI_VERSION = '14.22.0';
export const FULL_PRODUCTION_RESOURCE_PLAN = Object.freeze([
  'functions',
  'hosting',
  'firestore',
  'storage'
]);
export const ALLOWED_RELEASE_DIRTY_PATHS = Object.freeze([
  'firebase.production.json',
  'functions/.env.misechef-fa4bf',
  'functions/generated/publicStoreAppShell.html'
]);

export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const sha256File = filePath => sha256(readFileSync(filePath));

export const assertExactSha = (value, label = 'SHA') => {
  if (!/^[0-9a-f]{40}$/.test(value || '')) {
    throw new Error(`${label} must be an exact lowercase 40-character Git SHA.`);
  }
};

export const extractEntryAsset = html => {
  const match = String(html).match(/<script[^>]+src=["']([^"']*\/assets\/index-[^"']+\.js)["']/i);
  if (!match) throw new Error('Application shell does not reference a versioned index JavaScript asset.');
  return new URL(match[1], 'https://misechef.invalid').pathname;
};

export const assertProductionAuthority = ({
  expectedSha,
  approvedSha,
  protectedBaseline,
  resolvedSha,
  githubRef,
  githubEvent,
  isAncestor
}) => {
  for (const [label, value] of [
    ['Expected candidate SHA', expectedSha],
    ['Environment-approved SHA', approvedSha],
    ['Production protected baseline', protectedBaseline],
    ['Resolved candidate SHA', resolvedSha]
  ]) assertExactSha(value, label);
  if (githubEvent !== 'workflow_dispatch') throw new Error('Production releases must be manually dispatched.');
  if (githubRef !== 'refs/heads/main') throw new Error('Production release controller must run from main.');
  if (expectedSha !== approvedSha || expectedSha !== resolvedSha) {
    throw new Error('Production candidate does not match the exact Environment-approved SHA.');
  }
  if (!isAncestor(protectedBaseline, resolvedSha)) {
    throw new Error(`Production candidate ${resolvedSha} is not descended from protected baseline ${protectedBaseline}.`);
  }
};

export const assertProductionEnvironment = environment => {
  const exact = {
    FIREBASE_DEPLOY_TARGET: 'production',
    VITE_FIREBASE_PROJECT_ID: PRODUCTION_PROJECT_ID,
    VITE_FIREBASE_AUTH_DOMAIN: `${PRODUCTION_PROJECT_ID}.firebaseapp.com`,
    VITE_FIREBASE_STORAGE_BUCKET: PRODUCTION_STORAGE_BUCKET,
    PUBLIC_SITE_ORIGIN: PRODUCTION_ORIGIN
  };
  for (const [name, expected] of Object.entries(exact)) {
    if (environment[name] !== expected) throw new Error(`${name} must equal ${expected}.`);
  }
  for (const name of [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID',
    'SELLING_WORKSPACE_ID'
  ]) {
    if (!String(environment[name] || '').trim()) throw new Error(`${name} is required.`);
  }
  if (!/^pk_live_[A-Za-z0-9]+$/.test(environment.VITE_STRIPE_PUBLISHABLE_KEY || '')) {
    throw new Error('Production requires a Stripe live publishable key.');
  }
  if (environment.GITHUB_ACTIONS !== 'true' || environment.MISECHEF_PRODUCTION_CI_LOCK_ID !== 'misechef-production-deployment') {
    throw new Error('Canonical GitHub Actions Production deployment context is missing.');
  }
};

export const assertCleanCandidate = (dirtyPaths, allowed = []) => {
  const allowedSet = new Set(allowed);
  const unsafe = dirtyPaths.filter(filePath => !allowedSet.has(filePath));
  if (unsafe.length) throw new Error(`Production candidate worktree is dirty:\n- ${unsafe.join('\n- ')}`);
};

export const buildProductionFirebaseConfig = ({ candidateConfig, predeployCommand }) => {
  if (!candidateConfig?.functions || !candidateConfig?.firestore || !candidateConfig?.hosting) {
    throw new Error('Candidate Firebase configuration is incomplete.');
  }
  const candidateStorage = Array.isArray(candidateConfig.storage) ? candidateConfig.storage : [candidateConfig.storage];
  if (candidateStorage.length !== 1 || candidateStorage[0]?.rules !== 'storage.rules') {
    throw new Error('Candidate Storage Rules configuration is not the protected single-rules layout.');
  }
  return {
    functions: { ...candidateConfig.functions, predeploy: [predeployCommand] },
    firestore: { ...candidateConfig.firestore, predeploy: [predeployCommand] },
    storage: [{
      bucket: PRODUCTION_STORAGE_BUCKET,
      rules: 'storage.rules',
      predeploy: [predeployCommand]
    }],
    hosting: {
      ...candidateConfig.hosting,
      site: PRODUCTION_SITE_ID,
      predeploy: [predeployCommand]
    }
  };
};

export const assertProductionFirebaseConfig = config => {
  if (config?.hosting?.site !== PRODUCTION_SITE_ID) throw new Error('Production Hosting site is not explicit.');
  if (!Array.isArray(config?.storage) || config.storage.length !== 1
    || config.storage[0]?.bucket !== PRODUCTION_STORAGE_BUCKET) {
    throw new Error('Production Storage bucket is not explicit.');
  }
};

export const createProductionManifest = ({ repositoryRoot, sourceCommit, sourceTree, protectedBaseline, buildId, builtAt }) => {
  const distIndex = readFileSync(path.join(repositoryRoot, 'dist', 'index.html'), 'utf8');
  const storeShell = readFileSync(path.join(repositoryRoot, 'functions', 'generated', 'publicStoreAppShell.html'), 'utf8');
  const entryAsset = extractEntryAsset(distIndex);
  const storeShellAsset = extractEntryAsset(storeShell);
  if (entryAsset !== storeShellAsset) throw new Error('Production Hosting and renderPublicStore assets are incoherent.');
  return {
    kind: 'misechef-production-release',
    version: 1,
    buildId,
    builtAt,
    sourceCommit,
    sourceTree,
    protectedBaseline,
    entryAsset,
    entryAssetSha256: sha256File(path.join(repositoryRoot, 'dist', entryAsset.replace(/^\//, ''))),
    storeShellAsset
  };
};

export const assertArtifactCompatibility = ({ repositoryRoot, manifest, head, sourceTree, baseline, now = Date.now() }) => {
  if (manifest?.kind !== 'misechef-production-release' || manifest.sourceCommit !== head
    || manifest.sourceTree !== sourceTree || manifest.protectedBaseline !== baseline) {
    throw new Error('Production manifest does not match the approved candidate.');
  }
  const builtAt = Date.parse(manifest.builtAt);
  if (!Number.isFinite(builtAt) || builtAt > now + 60_000 || now - builtAt > 30 * 60 * 1000) {
    throw new Error('Production manifest is not a fresh build.');
  }
  const assetPath = path.join(repositoryRoot, 'dist', manifest.entryAsset.replace(/^\//, ''));
  if (!statSync(assetPath).isFile() || sha256File(assetPath) !== manifest.entryAssetSha256) {
    throw new Error('Production manifest asset hash is invalid.');
  }
  const rootAsset = extractEntryAsset(readFileSync(path.join(repositoryRoot, 'dist', 'index.html'), 'utf8'));
  const storeAsset = extractEntryAsset(readFileSync(path.join(repositoryRoot, 'functions', 'generated', 'publicStoreAppShell.html'), 'utf8'));
  if (rootAsset !== manifest.entryAsset || storeAsset !== manifest.entryAsset) {
    throw new Error('Production Hosting and Store shell do not match the manifest.');
  }
};

export const assertBootstrapLive = ({ fingerprint, expectedAsset, expectedVersion }) => {
  if (fingerprint.customRootAsset !== expectedAsset || fingerprint.defaultRootAsset !== expectedAsset) {
    throw new Error('Live Production Hosting asset changed from the approved bootstrap state.');
  }
  if (fingerprint.hostingVersion !== expectedVersion) {
    throw new Error('Live Production Hosting version changed from the approved bootstrap state.');
  }
  if (fingerprint.releaseCommit) throw new Error('Bootstrap authority is stale because Production already has a release manifest.');
};

export const assertLiveUnchanged = (before, current) => {
  if (JSON.stringify(before) !== JSON.stringify(current)) {
    throw new Error('Live Production release changed after validation began.');
  }
};

export const assertSession = ({ session, nonce, head, sourceTree, baseline, liveFingerprint, now = Date.now() }) => {
  if (session?.version !== 1 || session.nonce !== nonce || session.sourceCommit !== head
    || session.sourceTree !== sourceTree || session.protectedBaseline !== baseline) {
    throw new Error('Canonical Production deployment session is invalid.');
  }
  if (session.expiresAt < now) throw new Error('Canonical Production deployment session expired.');
  if (JSON.stringify(session.resources) !== JSON.stringify(FULL_PRODUCTION_RESOURCE_PLAN)) {
    throw new Error('Canonical Production deployment must include the exact full resource plan.');
  }
  if (JSON.stringify(session.liveFingerprint) !== JSON.stringify(liveFingerprint)) {
    throw new Error('Canonical Production session live fingerprint mismatch.');
  }
};

export const discoverCandidateFunctions = source => [...String(source).matchAll(/^export const ([A-Za-z0-9_]+)\s*=\s*on/gm)]
  .map(match => match[1])
  .sort();

export const assertPostDeploy = ({ fingerprint, expectedCommit, expectedTree, expectedFunctions, deployedFunctions }) => {
  if (fingerprint.releaseCommit !== expectedCommit || fingerprint.releaseSourceTree !== expectedTree) {
    throw new Error('Live Production manifest does not identify the approved SHA/tree.');
  }
  if (!fingerprint.customRootAsset || fingerprint.customRootAsset !== fingerprint.defaultRootAsset
    || fingerprint.customRootAsset !== fingerprint.releaseEntryAsset) {
    throw new Error('Production custom/default Hosting assets are incoherent.');
  }
  const deployed = new Map(deployedFunctions.map(item => [item.id, item.state]));
  const missing = expectedFunctions.filter(id => deployed.get(id) !== 'ACTIVE');
  if (missing.length) throw new Error(`Required Production Functions are not ACTIVE: ${missing.join(', ')}`);
};
