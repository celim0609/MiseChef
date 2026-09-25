import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BETA_PROJECT_ID, BETA_STORAGE_BUCKET, BETA_STORAGE_TARGET, MANDATORY_BETA_BASELINE, assertExplicitBetaStorageTarget } from './betaDeploymentSafety.mjs';

export const BETA_MIXED_RELEASE_20260926_INCIDENT = Object.freeze({
  id: 'beta-mixed-release-2026-09-26',
  confirmation: 'RECOVER BETA MIXED RELEASE 20260926',
  authorizationSha256: '0ff908a4a11ef4cbfbc7eb2dbba9e773e239e94877e841a9475bc55318be9d84',
  candidateCommit: '41b331b95e5354e14bf28a70c4f28e1578ab8d32',
  candidateSourceTree: 'd298e5b1eee4a60ade64e10e27fd5da1965481c1',
  live: Object.freeze({
    rootAsset: '/assets/index-BKXk7Nzq.js', storeAsset: '/assets/index-Cm6I4Suu.js',
    releaseCommit: '28c564bb86f2428d9e23f763b0e81cffda39c381',
    releaseSourceTree: 'c0b291d26246b248e58d4d809392051247ce7b6e',
    releaseProtectedBaseline: MANDATORY_BETA_BASELINE,
    releaseBuildId: '3c9e6856-25ad-412c-be7e-6c4c6763206b',
    releaseStoreShellAsset: '/assets/index-BKXk7Nzq.js',
    hostingVersion: 'sites/misechef-beta-fa4bf/versions/83657587aa4a7311',
    renderPublicStoreRevision: 'renderpublicstore-00133-gix'
  }),
  consumptionMarker: 'gs://misechef-beta-fa4bf.firebasestorage.app/misechef-release-guards/beta-mixed-release-2026-09-26.json'
});

export const BETA_DEPLOYER_SERVICE_ACCOUNT = 'github-beta-deployer@misechef-beta-fa4bf.iam.gserviceaccount.com';
export const BETA_APP_ENGINE_SERVICE_ACCOUNT = 'misechef-beta-fa4bf@appspot.gserviceaccount.com';
// Exact firebase-tools@14.22.0 deploy TARGET_PERMISSIONS for functions, hosting,
// firestore and storage, plus the HTTPS-function IAM check run by that CLI.

const fail = message => { throw new Error(`Beta mixed-release 20260926 recovery refused: ${message}`); };
const hash = value => createHash('sha256').update(value, 'utf8').digest('hex');

export const assertRecovery20260926Mode = ({ confirmation, authorization, githubActions, ciLockId }) => {
  if (confirmation !== BETA_MIXED_RELEASE_20260926_INCIDENT.confirmation
    || hash(authorization || '') !== BETA_MIXED_RELEASE_20260926_INCIDENT.authorizationSha256
    || !githubActions || ciLockId !== 'misechef-beta-deployment') fail('authorization, CI context, or lock is invalid.');
};
export const assert20260926Candidate = ({ head, sourceTree, isAncestor }) => {
  const incident = BETA_MIXED_RELEASE_20260926_INCIDENT;
  if (head !== incident.candidateCommit || sourceTree !== incident.candidateSourceTree || !isAncestor(incident.live.releaseCommit, head)) fail('candidate SHA or tree is not the approved descendant.');
};
export const assert20260926Available = marker => { if (marker) fail('incident is already consumed and cannot be retried.'); };
export const assert20260926LiveState = live => {
  for (const [key, value] of Object.entries(BETA_MIXED_RELEASE_20260926_INCIDENT.live)) if (live?.[key] !== value) fail(`durable live ${key} differs from the pinned incident state.`);
};
export const assertDurableLiveUnchanged = (before, current) => {
  const keys = ['rootAsset', 'storeAsset', 'rootAssetSha256', 'storeAssetSha256', 'releaseCommit', 'releaseSourceTree', 'releaseProtectedBaseline', 'releaseBuildId', 'releaseStoreShellAsset', 'hostingVersion', 'renderPublicStoreRevision'];
  if (!before || !current || keys.some(key => before[key] !== current[key])) fail('durable live release identity changed after validation began.');
};
export const create20260926Marker = ({ runId, startedAt = new Date().toISOString() } = {}) => ({
  incident: BETA_MIXED_RELEASE_20260926_INCIDENT.id,
  candidateCommit: BETA_MIXED_RELEASE_20260926_INCIDENT.candidateCommit,
  runId: String(runId || ''), deployStartedAt: startedAt
});
export const create20260926TemporaryRc = candidateRc => ({
  projects: { ...candidateRc?.projects },
  targets: { ...candidateRc?.targets, [BETA_PROJECT_ID]: { storage: { [BETA_STORAGE_TARGET]: [...(candidateRc?.targets?.[BETA_PROJECT_ID]?.storage?.[BETA_STORAGE_TARGET] || [])] } } },
  etags: {}
});
export const assert20260926TemporaryConfig = ({ firebaseConfig, firebaseRc, resolvedProject }) => {
  if (resolvedProject !== BETA_PROJECT_ID || resolvedProject === 'beta') fail('Firebase project must resolve to the concrete Beta project, never literal beta.');
  assertExplicitBetaStorageTarget({ firebaseConfig, firebaseRc });
  if (firebaseRc?.projects?.beta !== BETA_PROJECT_ID || firebaseRc?.targets?.[BETA_PROJECT_ID]?.storage?.[BETA_STORAGE_TARGET]?.[0] !== BETA_STORAGE_BUCKET) fail('temporary Firebase alias or Storage target is not Beta-only.');
};
export const write20260926TemporaryFirebaseFiles = ({ directory, firebaseConfig, candidateRc }) => {
  const firebaseRc = create20260926TemporaryRc(candidateRc);
  const configPath = path.join(directory, 'firebase.json');
  const rcPath = path.join(directory, '.firebaserc');
  writeFileSync(configPath, JSON.stringify(firebaseConfig));
  writeFileSync(rcPath, JSON.stringify(firebaseRc));
  if (!existsSync(configPath) || !existsSync(rcPath)) fail('temporary Firebase configuration files were not written.');
  assert20260926TemporaryConfig({ firebaseConfig: JSON.parse(readFileSync(configPath, 'utf8')), firebaseRc: JSON.parse(readFileSync(rcPath, 'utf8')), resolvedProject: BETA_PROJECT_ID });
  return { configPath, rcPath, firebaseRc };
};
export const assert20260926PermissionPreflight = ({ projectPermissions = [], actAsPermissions = [], requiredProjectPermissions = [] }) => {
  if (!Array.isArray(requiredProjectPermissions) || requiredProjectPermissions.length === 0) fail('pinned Firebase CLI permission contract is missing.');
  const missingProject = requiredProjectPermissions.filter(permission => !projectPermissions.includes(permission));
  if (missingProject.length) fail(`pinned full deploy permission preflight failed: ${missingProject.join(', ')}.`);
  if (!actAsPermissions.includes('iam.serviceAccounts.actAs')) fail(`missing iam.serviceAccounts.actAs on ${BETA_APP_ENGINE_SERVICE_ACCOUNT} for ${BETA_DEPLOYER_SERVICE_ACCOUNT}.`);
};
