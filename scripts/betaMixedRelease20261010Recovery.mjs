import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BETA_PROJECT_ID, BETA_STORAGE_BUCKET, BETA_STORAGE_TARGET, MANDATORY_BETA_BASELINE, assertExplicitBetaStorageTarget } from './betaDeploymentSafety.mjs';

export const BETA_MIXED_RELEASE_20261010_INCIDENT = Object.freeze({
  id: 'beta-mixed-release-2026-10-10',
  confirmation: 'RECOVER BETA MIXED RELEASE 20261010',
  authorizationSha256: 'c6ce045b852f2e2b6cd9dac1a32a72b9492b9e3f95523c600bf32a555713c8c4',
  candidateCommit: '9a489b009bdab45c88bf70e14969d7a6e9faed6b',
  candidateSourceTree: 'd52b5d0efd6b366ae2ab0db1fa277f23971426cf',
  live: Object.freeze({
    rootAsset: '/assets/index-BKDxaOya.js', storeAsset: '/assets/index-C_wOcVM6.js',
    releaseCommit: '9a489b009bdab45c88bf70e14969d7a6e9faed6b',
    releaseSourceTree: 'd52b5d0efd6b366ae2ab0db1fa277f23971426cf',
    releaseProtectedBaseline: MANDATORY_BETA_BASELINE,
    releaseBuildId: '460ab7a5-0d99-40ae-becc-2a050cccc385',
    releaseStoreShellAsset: '/assets/index-BKDxaOya.js',
    hostingVersion: 'sites/misechef-beta-fa4bf/versions/6f4d4c04f174e241',
    renderPublicStoreRevision: 'renderpublicstore-00177-riq'
  }),
  consumptionMarker: 'gs://misechef-beta-fa4bf.firebasestorage.app/misechef-release-guards/beta-mixed-release-2026-10-10.json'
});

export const BETA_DEPLOYER_SERVICE_ACCOUNT = 'github-beta-deployer@misechef-beta-fa4bf.iam.gserviceaccount.com';
export const BETA_APP_ENGINE_SERVICE_ACCOUNT = 'misechef-beta-fa4bf@appspot.gserviceaccount.com';
// Exact firebase-tools@14.22.0 deploy TARGET_PERMISSIONS for functions, hosting,
// firestore and storage, plus the HTTPS-function IAM check run by that CLI.

const fail = message => { throw new Error(`Beta mixed-release 20261010 recovery refused: ${message}`); };
const hash = value => createHash('sha256').update(value, 'utf8').digest('hex');

export const assertRecovery20261010Mode = ({ confirmation, authorization, githubActions, ciLockId }) => {
  if (confirmation !== BETA_MIXED_RELEASE_20261010_INCIDENT.confirmation
    || hash(authorization || '') !== BETA_MIXED_RELEASE_20261010_INCIDENT.authorizationSha256
    || !githubActions || ciLockId !== 'misechef-beta-deployment') fail('authorization, CI context, or lock is invalid.');
};
export const assert20261010Candidate = ({ head, sourceTree, isAncestor }) => {
  const incident = BETA_MIXED_RELEASE_20261010_INCIDENT;
  if (head !== incident.candidateCommit || sourceTree !== incident.candidateSourceTree || !isAncestor(incident.live.releaseCommit, head)) fail('candidate SHA or tree is not the approved descendant.');
};
export const assert20261010Available = marker => { if (marker) fail('incident is already consumed and cannot be retried.'); };
export const assert20261010LiveState = live => {
  for (const [key, value] of Object.entries(BETA_MIXED_RELEASE_20261010_INCIDENT.live)) if (live?.[key] !== value) fail(`durable live ${key} differs from the pinned incident state.`);
};
export const assertDurableLiveUnchanged = (before, current) => {
  const keys = ['rootAsset', 'storeAsset', 'rootAssetSha256', 'storeAssetSha256', 'releaseCommit', 'releaseSourceTree', 'releaseProtectedBaseline', 'releaseBuildId', 'releaseStoreShellAsset', 'hostingVersion', 'renderPublicStoreRevision'];
  if (!before || !current || keys.some(key => before[key] !== current[key])) fail('durable live release identity changed after validation began.');
};
export const create20261010Marker = ({ runId, startedAt = new Date().toISOString() } = {}) => ({
  incident: BETA_MIXED_RELEASE_20261010_INCIDENT.id,
  candidateCommit: BETA_MIXED_RELEASE_20261010_INCIDENT.candidateCommit,
  runId: String(runId || ''), deployStartedAt: startedAt
});
export const create20261010TemporaryRc = candidateRc => ({
  projects: { ...candidateRc?.projects },
  targets: { ...candidateRc?.targets, [BETA_PROJECT_ID]: { storage: { [BETA_STORAGE_TARGET]: [...(candidateRc?.targets?.[BETA_PROJECT_ID]?.storage?.[BETA_STORAGE_TARGET] || [])] } } },
  etags: {}
});
export const assert20261010TemporaryConfig = ({ firebaseConfig, firebaseRc, resolvedProject }) => {
  if (resolvedProject !== BETA_PROJECT_ID || resolvedProject === 'beta') fail('Firebase project must resolve to the concrete Beta project, never literal beta.');
  assertExplicitBetaStorageTarget({ firebaseConfig, firebaseRc });
  if (firebaseRc?.projects?.beta !== BETA_PROJECT_ID || firebaseRc?.targets?.[BETA_PROJECT_ID]?.storage?.[BETA_STORAGE_TARGET]?.[0] !== BETA_STORAGE_BUCKET) fail('temporary Firebase alias or Storage target is not Beta-only.');
};
export const write20261010TemporaryFirebaseFiles = ({ directory, firebaseConfig, candidateRc }) => {
  const firebaseRc = create20261010TemporaryRc(candidateRc);
  const configPath = path.join(directory, 'firebase.json');
  const rcPath = path.join(directory, '.firebaserc');
  writeFileSync(configPath, JSON.stringify(firebaseConfig));
  writeFileSync(rcPath, JSON.stringify(firebaseRc));
  if (!existsSync(configPath) || !existsSync(rcPath)) fail('temporary Firebase configuration files were not written.');
  assert20261010TemporaryConfig({ firebaseConfig: JSON.parse(readFileSync(configPath, 'utf8')), firebaseRc: JSON.parse(readFileSync(rcPath, 'utf8')), resolvedProject: BETA_PROJECT_ID });
  return { configPath, rcPath, firebaseRc };
};
export const assert20261010PermissionPreflight = ({ projectPermissions = [], actAsPermissions = [], requiredProjectPermissions = [] }) => {
  if (!Array.isArray(requiredProjectPermissions) || requiredProjectPermissions.length === 0) fail('pinned Firebase CLI permission contract is missing.');
  const missingProject = requiredProjectPermissions.filter(permission => !projectPermissions.includes(permission));
  if (missingProject.length) fail(`pinned full deploy permission preflight failed: ${missingProject.join(', ')}.`);
  if (!actAsPermissions.includes('iam.serviceAccounts.actAs')) fail(`missing iam.serviceAccounts.actAs on ${BETA_APP_ENGINE_SERVICE_ACCOUNT} for ${BETA_DEPLOYER_SERVICE_ACCOUNT}.`);
};
