import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { BETA_PROJECT_ID, MANDATORY_BETA_BASELINE } from './betaDeploymentSafety.mjs';

export const RELEASE_28_RECOVERY_CONFIRMATION = 'RECOVER BETA RELEASE 28';
export const RELEASE_28_RECOVERY_AUTHORIZATION =
  'release-28-partial:33189217434:3443de1b21042573aeffb7f23171abd2a23eff24';

const advanced = {
  createMiseChefGroupOrder: ['1787934863406732', '5f56c320400519527cb409240bac879bec9d0615'],
  createPublicStorePayment: ['1787934853362974', '885421062c24a0838e42de36d103e8cb9f0c1ff6'],
  expireWorkspaceTrials: ['1787934863371779', '5f56c320400519527cb409240bac879bec9d0615'],
  extractPersonalExpenseReceipt: ['1787934210959954', 'ff9ee01e4c935d8771db258405a71387be242aca'],
  generateRecipeSteps: ['1787934853427777', 'ff9ee01e4c935d8771db258405a71387be242aca'],
  getPublicMiseChefGroupOrder: ['1787934863490533', '5f56c320400519527cb409240bac879bec9d0615'],
  getWorkspaceSubscription: ['1787934863319489', '5f56c320400519527cb409240bac879bec9d0615'],
  listMyMiseChefGroupOrders: ['1787934863377057', '5f56c320400519527cb409240bac879bec9d0615'],
  parseInvoiceToJson: ['1787934328945070', 'ff9ee01e4c935d8771db258405a71387be242aca'],
  processResumeImportJob: ['1787934854686261', 'ff9ee01e4c935d8771db258405a71387be242aca'],
  provisionNewUserWorkspace: ['1787934863346573', '5f56c320400519527cb409240bac879bec9d0615'],
  recordPersonalExpenseSettlement: ['1787934853353926', '5f56c320400519527cb409240bac879bec9d0615'],
  renderPublicStore: ['1787934853288449', '5f56c320400519527cb409240bac879bec9d0615'],
  scanRecipeImage: ['1787934328912641', 'ff9ee01e4c935d8771db258405a71387be242aca'],
  stripeStorePaymentWebhook: ['1787934853427377', '6124fddb2d92ccdf25580693deb2b36558d2c6ac'],
  submitPublicStoreManualPayment: ['1787934853248648', '5f56c320400519527cb409240bac879bec9d0615'],
  syncPublicRecipe: ['1787934864653056', '5f56c320400519527cb409240bac879bec9d0615'],
  uploadPublicStorePaymentReceipt: ['1787934853481847', '5f56c320400519527cb409240bac879bec9d0615']
};

const retained = {
  activateMiseChefHost: ['1787923577600487', '5f56c320400519527cb409240bac879bec9d0615'],
  authorizeWorkspaceFeature: ['1787923577576174', '5f56c320400519527cb409240bac879bec9d0615'],
  cancelInvoiceUpload: ['1787923577733251', '5f56c320400519527cb409240bac879bec9d0615'],
  cancelPublicStorePayment: ['1787923499613333', '885421062c24a0838e42de36d103e8cb9f0c1ff6'],
  createInvoiceUpload: ['1787923577601754', '5f56c320400519527cb409240bac879bec9d0615'],
  getDashboardAiUsage: ['1787923577731119', '5f56c320400519527cb409240bac879bec9d0615'],
  getMyMiseChefGroupOrder: ['1787923498996287', '5f56c320400519527cb409240bac879bec9d0615'],
  getPublicDiscoverContent: ['1787923558156100', '5f56c320400519527cb409240bac879bec9d0615'],
  getPublicStorePaymentResult: ['1787923558217800', '885421062c24a0838e42de36d103e8cb9f0c1ff6'],
  listApprovedProducts: ['1787923577822779', '5f56c320400519527cb409240bac879bec9d0615'],
  parseResumeToPortfolio: ['1787923558080400', '5f56c320400519527cb409240bac879bec9d0615'],
  reviewStoreManualPayment: ['1787923558080567', '5f56c320400519527cb409240bac879bec9d0615'],
  syncApprovedProductRecipes: ['1787923578197620', '5f56c320400519527cb409240bac879bec9d0615'],
  syncCanonicalChefProfile: ['1787923578252248', '5f56c320400519527cb409240bac879bec9d0615'],
  syncMiseChefGroupReward: ['1787923578189119', '5f56c320400519527cb409240bac879bec9d0615'],
  syncPublicChefProfile: ['1787923578167034', '5f56c320400519527cb409240bac879bec9d0615'],
  trackPublicProductClick: ['1787923577707808', '5f56c320400519527cb409240bac879bec9d0615'],
  updateMyMiseChefGroupOrderStatus: ['1787923577243569', '5f56c320400519527cb409240bac879bec9d0615'],
  updateStoreOrderStatus: ['1787923558144143', '5f56c320400519527cb409240bac879bec9d0615']
};

const functionFingerprint = (entries, phase) => Object.fromEntries(
  Object.entries(entries).map(([id, [generation, hash]]) => [id, { generation, hash, phase }])
);

export const RELEASE_28_INCIDENT = Object.freeze({
  id: 'beta-release-28-partial-functions-hosting',
  failedRunId: '33189217434',
  priorCommit: '67992dc2f99ceaab50c2a6af5f9bbc4e23808b7c',
  priorSourceTree: 'd300940dde2538e392b775e8f6e1a68b370898e8',
  candidateCommit: '3443de1b21042573aeffb7f23171abd2a23eff24',
  candidateSourceTree: 'e27ed7a01e6c8d1035861dbdf295732370862b22',
  rootAsset: '/assets/index-CgHcQl6I.js',
  storeAsset: '/assets/index-CjgRzN0d.js',
  priorManifest: Object.freeze({
    kind: 'misechef-beta-release',
    version: 1,
    buildId: 'd1fa2c8b-e0c3-4400-9785-0d86758a276c',
    builtAt: '2026-08-28T13:24:29.956Z',
    sourceCommit: '67992dc2f99ceaab50c2a6af5f9bbc4e23808b7c',
    sourceTree: 'd300940dde2538e392b775e8f6e1a68b370898e8',
    protectedBaseline: MANDATORY_BETA_BASELINE,
    entryAsset: '/assets/index-CgHcQl6I.js',
    entryAssetSha256: 'f294c9a70ca9666208a26b953ce4f4adb6fbf49fedb43bfba6b4335e158e164e',
    storeShellAsset: '/assets/index-CgHcQl6I.js'
  }),
  functions: Object.freeze({
    ...functionFingerprint(advanced, 'advanced'),
    ...functionFingerprint(retained, 'retained')
  })
});

const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
};

const same = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const fail = message => { throw new Error(`Beta Release #28 recovery refused: ${message}`); };

export const resolveRelease28RecoveryMode = ({ confirmation, authorization, githubActions, ciLockId }) => {
  if (!confirmation) return false;
  if (confirmation !== RELEASE_28_RECOVERY_CONFIRMATION) fail('the incident confirmation is not exact.');
  if (authorization !== RELEASE_28_RECOVERY_AUTHORIZATION) {
    fail('the protected Beta environment has not supplied the exact incident authorization.');
  }
  if (githubActions !== true || ciLockId !== 'misechef-beta-deployment') {
    fail('recovery is permitted only inside the locked protected Beta workflow.');
  }
  return true;
};

const normalizedFunctions = functions => [...(functions || [])]
  .map(item => ({
    id: String(item.id || ''),
    generation: String(item.generation || item.source?.storageSource?.generation || ''),
    hash: String(item.hash || ''),
    state: String(item.state || '')
  }))
  .sort((left, right) => left.id.localeCompare(right.id));

const expectedFunctions = () => Object.entries(RELEASE_28_INCIDENT.functions)
  .map(([id, value]) => ({ id, generation: value.generation, hash: value.hash, state: 'ACTIVE' }))
  .sort((left, right) => left.id.localeCompare(right.id));

export const assertRelease28PartialState = ({
  head,
  sourceTree,
  liveFingerprint,
  functions,
  resolveSourceTree,
  isAncestor
}) => {
  if (head !== RELEASE_28_INCIDENT.candidateCommit || sourceTree !== RELEASE_28_INCIDENT.candidateSourceTree) {
    fail('the checked-out candidate SHA or source tree is not the authorized recovery candidate.');
  }
  if (!same(liveFingerprint?.releaseMetadata, RELEASE_28_INCIDENT.priorManifest)) {
    fail('live manifest metadata does not exactly match the prior coherent release.');
  }
  if (
    liveFingerprint?.rootAsset !== RELEASE_28_INCIDENT.rootAsset
    || liveFingerprint?.storeAsset !== RELEASE_28_INCIDENT.storeAsset
  ) {
    fail('live Hosting root or public Store asset does not match the known partial deployment.');
  }
  if (resolveSourceTree(RELEASE_28_INCIDENT.priorCommit) !== RELEASE_28_INCIDENT.priorSourceTree) {
    fail('the prior manifest source tree does not match Git.');
  }
  if (!isAncestor(MANDATORY_BETA_BASELINE, RELEASE_28_INCIDENT.priorCommit)) {
    fail('the protected baseline is not an ancestor of the prior coherent release.');
  }
  const actualFunctions = normalizedFunctions(functions);
  if (!same(actualFunctions, expectedFunctions())) {
    fail('Function inventory, generation, source hash, or ACTIVE state differs from the recorded 18/19 split.');
  }
  const expandedState = {
    rootAsset: liveFingerprint.rootAsset,
    storeAsset: liveFingerprint.storeAsset,
    releaseMetadata: liveFingerprint.releaseMetadata,
    functions: actualFunctions
  };
  return {
    incidentId: RELEASE_28_INCIDENT.id,
    failedRunId: RELEASE_28_INCIDENT.failedRunId,
    fingerprint: digest(expandedState),
    state: expandedState
  };
};

export const assertRelease28CandidateArtifact = manifest => {
  if (
    manifest?.sourceCommit !== RELEASE_28_INCIDENT.candidateCommit
    || manifest?.sourceTree !== RELEASE_28_INCIDENT.candidateSourceTree
    || manifest?.entryAsset !== RELEASE_28_INCIDENT.storeAsset
    || manifest?.storeShellAsset !== RELEASE_28_INCIDENT.storeAsset
  ) {
    fail('the rebuilt candidate does not reproduce the Store shell deployed by Release #28.');
  }
};

export const assertRelease28FailedRun = ({ run, jobs }) => {
  if (
    String(run?.id || '') !== RELEASE_28_INCIDENT.failedRunId
    || run?.name !== 'Beta Release'
    || run?.run_number !== 28
    || run?.head_sha !== RELEASE_28_INCIDENT.candidateCommit
    || run?.conclusion !== 'failure'
    || run?.path !== '.github/workflows/deploy-beta.yml'
  ) fail('GitHub does not identify the authorized failed Release #28 run.');
  const steps = (jobs || []).flatMap(job => job.steps || []);
  const requiredSuccesses = [
    'Verify exact approved candidate SHA',
    'Validate actual release candidate with immutable trusted gate',
    'Run complete immutable trusted candidate regression gate',
    'Run Store Sets Firestore authorization suite',
    'Authenticate to Beta only'
  ];
  if (requiredSuccesses.some(name => !steps.some(step => step.name === name && step.conclusion === 'success'))) {
    fail('Release #28 did not pass every protected pre-deployment step.');
  }
  if (!steps.some(step => step.name === 'Run canonical protected full-resource Beta release' && step.conclusion === 'failure')) {
    fail('Release #28 did not fail in the canonical deployment step.');
  }
};

export const verifyRelease28FailedRun = async ({ repository, token = '', request = fetch }) => {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '')) {
    fail('the protected workflow repository identity is unavailable.');
  }
  const headers = {
    Accept: 'application/vnd.github+json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
  const runUrl = `https://api.github.com/repos/${repository}/actions/runs/${RELEASE_28_INCIDENT.failedRunId}`;
  const [runResponse, jobsResponse] = await Promise.all([
    request(runUrl, { headers }),
    request(`${runUrl}/jobs?per_page=100`, { headers })
  ]);
  if (!runResponse.ok || !jobsResponse.ok) fail('the protected workflow could not verify Release #28 evidence.');
  const [run, jobsPayload] = await Promise.all([runResponse.json(), jobsResponse.json()]);
  assertRelease28FailedRun({ run, jobs: jobsPayload.jobs });
};

export const assertRelease28RecoveryConverged = ({ liveFingerprint, functions, manifest, assetProof }) => {
  if (
    liveFingerprint?.releaseCommit !== RELEASE_28_INCIDENT.candidateCommit
    || liveFingerprint?.releaseSourceTree !== RELEASE_28_INCIDENT.candidateSourceTree
    || liveFingerprint?.releaseProtectedBaseline !== MANDATORY_BETA_BASELINE
    || !same(liveFingerprint?.releaseMetadata, manifest)
  ) fail('live manifest does not identify the exact recovery candidate build.');
  if (
    liveFingerprint.rootAsset !== manifest.entryAsset
    || liveFingerprint.storeAsset !== manifest.entryAsset
  ) fail('Hosting root and public Store do not reference the recovered candidate asset.');
  if (
    assetProof?.status !== 200
    ||
    !/^(?:application|text)\/javascript(?:;|$)/i.test(String(assetProof?.contentType || ''))
    || assetProof?.sha256 !== manifest.entryAssetSha256
  ) fail('the recovered candidate asset is not served as the expected JavaScript bytes.');

  const actualFunctions = normalizedFunctions(functions);
  const expectedIds = expectedFunctions().map(item => item.id);
  if (!same(actualFunctions.map(item => item.id), expectedIds) || actualFunctions.some(item => item.state !== 'ACTIVE')) {
    fail('the recovered Function inventory is not exactly 37 ACTIVE Functions.');
  }
  const currentById = new Map(actualFunctions.map(item => [item.id, item]));
  for (const [id, expected] of Object.entries(RELEASE_28_INCIDENT.functions)) {
    if (currentById.get(id)?.hash !== expected.hash) {
      fail(`recovered Function ${id} does not use the authorized candidate source hash.`);
    }
    if (expected.phase === 'retained' && currentById.get(id)?.generation === expected.generation) {
      fail(`previously retained Function ${id} did not converge.`);
    }
  }
};

export const readBetaFunctionState = ({ run = execFileSync } = {}) => {
  const output = run('firebase', ['functions:list', '--project', BETA_PROJECT_ID, '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit']
  });
  const parsed = JSON.parse(output);
  if (parsed?.status !== 'success' || !Array.isArray(parsed.result)) {
    fail('Firebase did not return a readable Function inventory.');
  }
  return normalizedFunctions(parsed.result);
};

export const readLiveAssetProof = async ({ origin, asset }) => {
  const response = await fetch(`${origin}${asset}?beta-recovery-check=${Date.now()}`, {
    headers: { 'Cache-Control': 'no-cache, no-store' },
    redirect: 'follow'
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    status: response.status,
    contentType: response.headers.get('content-type') || '',
    sha256: createHash('sha256').update(bytes).digest('hex')
  };
};

export const readLiveReleaseMetadata = async ({
  origin = 'https://misechef-beta-fa4bf.web.app',
  request = fetch
} = {}) => {
  const response = await request(
    `${origin}/.well-known/misechef-beta-release.json?beta-recovery-check=${Date.now()}`,
    { headers: { 'Cache-Control': 'no-cache, no-store' }, redirect: 'follow' }
  );
  if (!response.ok) fail('live release manifest could not be read.');
  try {
    return await response.json();
  } catch {
    fail('live release manifest is not valid JSON.');
  }
};
