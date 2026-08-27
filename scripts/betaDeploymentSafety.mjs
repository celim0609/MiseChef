import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export const MANDATORY_BETA_BASELINE = '06a37c0d30c47e037994454119a0461955df4ee3';
export const BETA_PROJECT_ID = 'misechef-beta-fa4bf';
export const PRODUCTION_PROJECT_ID = 'misechef-fa4bf';
export const BETA_STORAGE_TARGET = 'beta-default';
export const BETA_STORAGE_BUCKET = 'misechef-beta-fa4bf.firebasestorage.app';
export const PINNED_FIREBASE_CLI_VERSION = '14.22.0';
export const FULL_BETA_RESOURCE_PLAN = Object.freeze([
  'functions',
  'hosting',
  'firestore',
  'storage'
]);
export const ALLOWED_POST_BUILD_DIRTY_PATHS = Object.freeze([
  'functions/generated/publicStoreAppShell.html'
]);

export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const sha256File = filePath => sha256(readFileSync(filePath));

export const extractEntryAsset = html => {
  const match = String(html).match(/<script[^>]+src=["']([^"']*\/assets\/index-[^"']+\.js)["']/i);
  if (!match) throw new Error('Application shell does not reference a versioned index JavaScript asset.');
  return new URL(match[1], 'https://misechef.invalid').pathname;
};

export const assertExactResourcePlan = resources => {
  const normalized = [...new Set(resources || [])].sort();
  const required = [...FULL_BETA_RESOURCE_PLAN].sort();
  if (JSON.stringify(normalized) !== JSON.stringify(required)) {
    throw new Error(
      `Unsupported partial Beta resource plan: ${normalized.join(', ') || '(empty)'}. ` +
      `The canonical release must deploy ${required.join(', ')} together.`
    );
  }
};

export const resolveStorageTarget = (firebaseRc, projectId, target) => (
  firebaseRc?.targets?.[projectId]?.storage?.[target] || []
);

export const assertExplicitBetaStorageTarget = ({ firebaseConfig, firebaseRc }) => {
  if (!Array.isArray(firebaseConfig?.storage) || firebaseConfig.storage.length !== 1) {
    throw new Error('Beta Storage must use exactly one explicit array-based target configuration.');
  }

  const [storageConfig] = firebaseConfig.storage;
  if (
    storageConfig.target !== BETA_STORAGE_TARGET
    || storageConfig.rules !== 'storage.rules'
  ) {
    throw new Error(`Beta Storage must target only ${BETA_STORAGE_TARGET} with storage.rules.`);
  }
  if (
    firebaseRc?.projects?.beta !== BETA_PROJECT_ID
    || firebaseRc?.projects?.production !== PRODUCTION_PROJECT_ID
  ) {
    throw new Error('Firebase project aliases do not match the protected Beta and Production projects.');
  }

  const betaBuckets = resolveStorageTarget(firebaseRc, BETA_PROJECT_ID, BETA_STORAGE_TARGET);
  if (
    !Array.isArray(betaBuckets)
    || betaBuckets.length !== 1
    || betaBuckets[0] !== BETA_STORAGE_BUCKET
  ) {
    throw new Error(`The protected Beta Storage target must resolve only to ${BETA_STORAGE_BUCKET}.`);
  }

  for (const [projectId, projectTargets] of Object.entries(firebaseRc?.targets || {})) {
    if (projectId === BETA_PROJECT_ID) continue;
    const storageTargets = projectTargets?.storage || {};
    if (
      Object.hasOwn(storageTargets, BETA_STORAGE_TARGET)
      || Object.values(storageTargets).some(buckets => (
        Array.isArray(buckets) && buckets.includes(BETA_STORAGE_BUCKET)
      ))
    ) {
      throw new Error(`Beta Storage target or bucket must not resolve for non-Beta project ${projectId}.`);
    }
  }

  if (resolveStorageTarget(firebaseRc, PRODUCTION_PROJECT_ID, BETA_STORAGE_TARGET).length !== 0) {
    throw new Error('The Beta Storage target unexpectedly resolves for Production.');
  }
};

export const assertPinnedFirebaseCliStorageBehavior = ({ version, prepareSource }) => {
  if (version !== PINNED_FIREBASE_CLI_VERSION) {
    throw new Error(`Protected Beta deployment requires Firebase CLI ${PINNED_FIREBASE_CLI_VERSION}; found ${version || '(missing)'}.`);
  }
  const defaultBucketCalls = String(prepareSource).match(/getDefaultBucket\s*\(/g) || [];
  const arrayBypassGuard = /if\s*\(\s*!Array\.isArray\(rulesConfig\)\s*&&\s*options\.project\s*\)\s*\{[\s\S]*?getDefaultBucket\s*\(\s*options\.project\s*\)/;
  if (defaultBucketCalls.length !== 1 || !arrayBypassGuard.test(String(prepareSource))) {
    throw new Error('Pinned Firebase CLI no longer proves that explicit array-based Storage targets bypass defaultBucket discovery.');
  }
};

export const assertCleanSource = (dirtyPaths, allowedPaths = []) => {
  const allowed = new Set(allowedPaths);
  const unsafe = (dirtyPaths || []).filter(filePath => !allowed.has(filePath));
  if (unsafe.length) {
    throw new Error(`Beta release worktree is dirty:\n- ${unsafe.join('\n- ')}`);
  }
};

export const assertAuthority = ({ authorityBaseline, documentedBaseline, head, isAncestor }) => {
  if (!authorityBaseline) {
    throw new Error('MISECHEF_BETA_PROTECTED_BASELINE is required from authoritative release configuration.');
  }
  if (authorityBaseline !== MANDATORY_BETA_BASELINE) {
    throw new Error(
      `Authoritative Beta baseline ${authorityBaseline} does not match mandatory baseline ${MANDATORY_BETA_BASELINE}.`
    );
  }
  if (documentedBaseline !== authorityBaseline) {
    throw new Error(
      `Repository baseline ${documentedBaseline} does not match authoritative baseline ${authorityBaseline}.`
    );
  }
  if (!isAncestor(authorityBaseline, head)) {
    throw new Error(`Beta candidate ${head} is not descended from protected baseline ${authorityBaseline}.`);
  }
};

export const assertCanonicalContext = ({
  firebaseTarget,
  firebaseProject,
  sessionFile,
  sessionNonce,
  githubActions,
  ciLockId,
  allowLocalDeploy
}) => {
  if (firebaseProject === BETA_PROJECT_ID && firebaseTarget !== 'beta') {
    throw new Error('Beta deployment context is missing FIREBASE_DEPLOY_TARGET=beta.');
  }
  if (firebaseTarget !== 'beta' || firebaseProject !== BETA_PROJECT_ID) {
    throw new Error(`Canonical Beta deployment must target ${BETA_PROJECT_ID}.`);
  }
  if (!sessionFile || !sessionNonce) {
    throw new Error('Direct Firebase Beta deployment is unsupported: canonical release session is missing.');
  }
  if (githubActions) {
    if (ciLockId !== 'misechef-beta-deployment') {
      throw new Error('Authoritative CI Beta deployment lock is missing.');
    }
  } else if (!allowLocalDeploy) {
    throw new Error(
      'Local Beta deployment is disabled. Use the protected CI Beta Release workflow. ' +
      'Emergency local release requires MISECHEF_BETA_ALLOW_LOCAL_DEPLOY=1.'
    );
  }
};

export const assertLiveReleaseUnchanged = (before, current) => {
  if (!before || !current || JSON.stringify(before) !== JSON.stringify(current)) {
    throw new Error('Live Beta release changed after validation began. Stop and integrate the newer release.');
  }
};

export const assertLiveBaseline = ({ liveFingerprint, resolveSourceTree, isAncestor }) => {
  const liveCommit = liveFingerprint?.releaseCommit;
  const liveSourceTree = liveFingerprint?.releaseSourceTree;
  const liveProtectedBaseline = liveFingerprint?.releaseProtectedBaseline;
  if (
    !/^[0-9a-f]{40}$/.test(liveCommit || '')
    || !/^[0-9a-f]{40}$/.test(liveSourceTree || '')
    || !/^[0-9a-f]{40}$/.test(liveProtectedBaseline || '')
  ) {
    throw new Error(
      'Live Beta release metadata is missing or unreadable. Deployment is blocked until a manifest-bearing approved release is restored.'
    );
  }
  let resolvedSourceTree;
  try {
    resolvedSourceTree = resolveSourceTree(liveCommit);
  } catch {
    throw new Error('Live Beta release sourceCommit cannot be resolved in Git.');
  }
  if (resolvedSourceTree !== liveSourceTree) {
    throw new Error('Live Beta release sourceTree does not match its sourceCommit Git tree.');
  }
  let baselineIsAncestor = false;
  try {
    baselineIsAncestor = isAncestor(liveProtectedBaseline, liveCommit);
  } catch {
    baselineIsAncestor = false;
  }
  if (!baselineIsAncestor) {
    throw new Error('Live Beta release protectedBaseline is not an ancestor of its sourceCommit.');
  }
  if (!liveFingerprint.rootAsset || liveFingerprint.rootAsset !== liveFingerprint.storeAsset) {
    throw new Error('Live Beta Hosting and public Store assets do not identify one coherent release.');
  }
};

export const assertArtifactCompatibility = ({ repositoryRoot, manifest, head, baseline, now = Date.now() }) => {
  if (!manifest || manifest.sourceCommit !== head || manifest.protectedBaseline !== baseline) {
    throw new Error('Beta dist manifest is stale or was built from a different commit/baseline.');
  }
  if (manifest.sourceTree !== manifest.currentSourceTree) {
    throw new Error('Beta dist manifest source tree does not match the current HEAD tree.');
  }
  const builtAt = Date.parse(manifest.builtAt);
  if (!Number.isFinite(builtAt) || builtAt > now + 60_000 || now - builtAt > 30 * 60 * 1000) {
    throw new Error('Beta dist manifest is not a fresh build from the current release session.');
  }

  const distIndexPath = path.join(repositoryRoot, 'dist', 'index.html');
  const storeShellPath = path.join(repositoryRoot, 'functions', 'generated', 'publicStoreAppShell.html');
  const distAsset = extractEntryAsset(readFileSync(distIndexPath, 'utf8'));
  const storeAsset = extractEntryAsset(readFileSync(storeShellPath, 'utf8'));
  if (distAsset !== storeAsset || distAsset !== manifest.entryAsset) {
    throw new Error(
      `Hosting/renderPublicStore asset mismatch: dist=${distAsset}, Store shell=${storeAsset}, manifest=${manifest.entryAsset}.`
    );
  }

  const assetPath = path.join(repositoryRoot, 'dist', distAsset.replace(/^\//, ''));
  if (!statSync(assetPath).isFile()) {
    throw new Error(`Hosting entry asset is missing from dist: ${distAsset}`);
  }
  if (sha256File(assetPath) !== manifest.entryAssetSha256) {
    throw new Error(`Hosting entry asset hash does not match the build manifest: ${distAsset}`);
  }
};

export const assertSession = ({ session, nonce, head, baseline, now = Date.now() }) => {
  if (!session || session.version !== 1 || session.nonce !== nonce) {
    throw new Error('Canonical Beta deployment session is invalid.');
  }
  if (session.sourceCommit !== head || session.protectedBaseline !== baseline) {
    throw new Error('Canonical Beta deployment session does not match the current candidate.');
  }
  if (!Number.isFinite(session.expiresAt) || session.expiresAt < now) {
    throw new Error('Canonical Beta deployment session has expired. Revalidate and rebuild before retrying.');
  }
  assertExactResourcePlan(session.resources);
};
