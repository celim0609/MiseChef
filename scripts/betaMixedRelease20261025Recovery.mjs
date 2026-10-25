import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BETA_PROJECT_ID, BETA_STORAGE_BUCKET, BETA_STORAGE_TARGET, MANDATORY_BETA_BASELINE, assertExplicitBetaStorageTarget } from './betaDeploymentSafety.mjs';

export const BETA_MIXED_RELEASE_20261025_INCIDENT = Object.freeze({
  id: 'beta-run-40156447172',
  confirmation: 'RECOVER BETA RUN 40156447172',
  authorizationSha256: 'be0c01cfe1487291a73195dfd1881a624de159cda6af648ba5c93bb4cd7253a3',
  candidateCommit: 'f006237f65c60d6a7d18a5970f3bfc53557db6b0',
  candidateSourceTree: '9469486349c39376db65e4d464b7721b255ad321',
  live: Object.freeze({
    rootAsset: '/assets/index-DHNm0rBK.js', storeAsset: '/assets/index-cTnS2l_l.js',
    rootAssetSha256: '12c141b99c2e02da820b66013bd305c8263d6d930c0ffd8346ce2a6095a10dad', storeAssetSha256: '795801a5d3216af57f3c7d398b552a62ce83fdd818bdc63a9d0e32f16211ffca',
    releaseCommit: '5ad8fb98c9ad16f60124a772477e6c20a55725a4',
    releaseSourceTree: 'f337da27755d01bc1c5390a6c41a9fe1a96e73fe',
    releaseProtectedBaseline: MANDATORY_BETA_BASELINE,
    releaseBuildId: '3e095d18-f8ba-4d6e-ab44-f6638f7f5efd',
    releaseStoreShellAsset: '/assets/index-DHNm0rBK.js',
    hostingVersion: 'sites/misechef-beta-fa4bf/versions/53b4f9a5d93ad3a0',
    renderPublicStoreRevision: 'renderpublicstore-00230-nus'
  }),
  consumptionMarker: 'gs://misechef-beta-fa4bf.firebasestorage.app/misechef-release-guards/beta-run-40156447172.json'
});

export const BETA_DEPLOYER_SERVICE_ACCOUNT = 'github-beta-deployer@misechef-beta-fa4bf.iam.gserviceaccount.com';
export const BETA_APP_ENGINE_SERVICE_ACCOUNT = 'misechef-beta-fa4bf@appspot.gserviceaccount.com';
// Exact firebase-tools@14.22.0 deploy TARGET_PERMISSIONS for functions, hosting,
// firestore and storage, plus the HTTPS-function IAM check run by that CLI.

const fail = message => { throw new Error(`Beta mixed-release 20261025 recovery refused: ${message}`); };
const hash = value => createHash('sha256').update(value, 'utf8').digest('hex');

export const assertRecovery20261025Mode = ({ confirmation, authorization, githubActions, ciLockId }) => {
  if (confirmation !== BETA_MIXED_RELEASE_20261025_INCIDENT.confirmation
    || hash(authorization || '') !== BETA_MIXED_RELEASE_20261025_INCIDENT.authorizationSha256
    || !githubActions || ciLockId !== 'misechef-beta-deployment') fail('authorization, CI context, or lock is invalid.');
};
export const assert20261025Candidate = ({ head, sourceTree, isAncestor }) => {
  const incident = BETA_MIXED_RELEASE_20261025_INCIDENT;
  if (head !== incident.candidateCommit || sourceTree !== incident.candidateSourceTree || !isAncestor(incident.live.releaseCommit, head)) fail('candidate SHA or tree is not the approved descendant.');
};
export const assert20261025Available = marker => { if (marker) fail('incident is already consumed and cannot be retried.'); };
export const assert20261025LiveState = live => {
  for (const [key, value] of Object.entries(BETA_MIXED_RELEASE_20261025_INCIDENT.live)) if (live?.[key] !== value) fail(`durable live ${key} differs from the pinned incident state.`);
};
export const assertDurableLiveUnchanged = (before, current) => {
  const keys = ['rootAsset', 'storeAsset', 'rootAssetSha256', 'storeAssetSha256', 'releaseCommit', 'releaseSourceTree', 'releaseProtectedBaseline', 'releaseBuildId', 'releaseStoreShellAsset', 'hostingVersion', 'renderPublicStoreRevision'];
  if (!before || !current || keys.some(key => before[key] !== current[key])) fail('durable live release identity changed after validation began.');
};
export const create20261025Marker = ({ runId, startedAt = new Date().toISOString() } = {}) => ({
  incident: BETA_MIXED_RELEASE_20261025_INCIDENT.id,
  candidateCommit: BETA_MIXED_RELEASE_20261025_INCIDENT.candidateCommit,
  runId: String(runId || ''), deployStartedAt: startedAt
});
export const create20261025TemporaryRc = candidateRc => ({
  projects: { ...candidateRc?.projects },
  targets: { ...candidateRc?.targets, [BETA_PROJECT_ID]: { storage: { [BETA_STORAGE_TARGET]: [...(candidateRc?.targets?.[BETA_PROJECT_ID]?.storage?.[BETA_STORAGE_TARGET] || [])] } } },
  etags: {}
});
export const assert20261025TemporaryConfig = ({ firebaseConfig, firebaseRc, resolvedProject }) => {
  if (resolvedProject !== BETA_PROJECT_ID || resolvedProject === 'beta') fail('Firebase project must resolve to the concrete Beta project, never literal beta.');
  assertExplicitBetaStorageTarget({ firebaseConfig, firebaseRc });
  if (firebaseRc?.projects?.beta !== BETA_PROJECT_ID || firebaseRc?.targets?.[BETA_PROJECT_ID]?.storage?.[BETA_STORAGE_TARGET]?.[0] !== BETA_STORAGE_BUCKET) fail('temporary Firebase alias or Storage target is not Beta-only.');
};
export const write20261025TemporaryFirebaseFiles = ({ directory, firebaseConfig, candidateRc }) => {
  const firebaseRc = create20261025TemporaryRc(candidateRc);
  const configPath = path.join(directory, 'firebase.json');
  const rcPath = path.join(directory, '.firebaserc');
  writeFileSync(configPath, JSON.stringify(firebaseConfig));
  writeFileSync(rcPath, JSON.stringify(firebaseRc));
  if (!existsSync(configPath) || !existsSync(rcPath)) fail('temporary Firebase configuration files were not written.');
  assert20261025TemporaryConfig({ firebaseConfig: JSON.parse(readFileSync(configPath, 'utf8')), firebaseRc: JSON.parse(readFileSync(rcPath, 'utf8')), resolvedProject: BETA_PROJECT_ID });
  return { configPath, rcPath, firebaseRc };
};
export const assert20261025PermissionPreflight = ({ projectPermissions = [], actAsPermissions = [], requiredProjectPermissions = [] }) => {
  if (!Array.isArray(requiredProjectPermissions) || requiredProjectPermissions.length === 0) fail('pinned Firebase CLI permission contract is missing.');
  const missingProject = requiredProjectPermissions.filter(permission => !projectPermissions.includes(permission));
  if (missingProject.length) fail(`pinned full deploy permission preflight failed: ${missingProject.join(', ')}.`);
  if (!actAsPermissions.includes('iam.serviceAccounts.actAs')) fail(`missing iam.serviceAccounts.actAs on ${BETA_APP_ENGINE_SERVICE_ACCOUNT} for ${BETA_DEPLOYER_SERVICE_ACCOUNT}.`);
};
