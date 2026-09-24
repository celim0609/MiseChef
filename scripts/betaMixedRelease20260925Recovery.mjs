import { createHash } from 'node:crypto';
import { BETA_PROJECT_ID, MANDATORY_BETA_BASELINE } from './betaDeploymentSafety.mjs';

export const BETA_MIXED_RELEASE_20260925_INCIDENT = Object.freeze({
  id: 'beta-mixed-release-2026-09-25',
  confirmation: 'RECOVER BETA MIXED RELEASE 20260925',
  authorizationSha256: '5ab3f40fdea2168c9fbcbfca2d428b140cdd2af9f550db1da8f7fa83e54c9162',
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
  consumptionMarker: 'gs://misechef-beta-fa4bf.firebasestorage.app/misechef-release-guards/beta-mixed-release-2026-09-25.json'
});

const fail = message => { throw new Error(`Beta mixed-release 20260925 recovery refused: ${message}`); };
const hash = value => createHash('sha256').update(value, 'utf8').digest('hex');

export const assertRecovery20260925Mode = ({ confirmation, authorization, githubActions, ciLockId }) => {
  if (confirmation !== BETA_MIXED_RELEASE_20260925_INCIDENT.confirmation
    || hash(authorization || '') !== BETA_MIXED_RELEASE_20260925_INCIDENT.authorizationSha256
    || !githubActions || ciLockId !== 'misechef-beta-deployment') fail('authorization, CI context, or lock is invalid.');
};
export const assert20260925Candidate = ({ head, sourceTree, isAncestor }) => {
  const incident = BETA_MIXED_RELEASE_20260925_INCIDENT;
  if (head !== incident.candidateCommit || sourceTree !== incident.candidateSourceTree || !isAncestor(incident.live.releaseCommit, head)) fail('candidate SHA or tree is not the approved descendant.');
};
export const assert20260925Available = marker => { if (marker) fail('incident is already consumed and cannot be retried.'); };
export const assert20260925LiveState = live => {
  for (const [key, value] of Object.entries(BETA_MIXED_RELEASE_20260925_INCIDENT.live)) if (live?.[key] !== value) fail(`durable live ${key} differs from the pinned incident state.`);
};
export const assertDurableLiveUnchanged = (before, current) => {
  const keys = ['rootAsset', 'storeAsset', 'rootAssetSha256', 'storeAssetSha256', 'releaseCommit', 'releaseSourceTree', 'releaseProtectedBaseline', 'releaseBuildId', 'releaseStoreShellAsset', 'hostingVersion', 'renderPublicStoreRevision'];
  if (!before || !current || keys.some(key => before[key] !== current[key])) fail('durable live release identity changed after validation began.');
};
export const create20260925Marker = ({ runId, startedAt = new Date().toISOString() } = {}) => ({
  incident: BETA_MIXED_RELEASE_20260925_INCIDENT.id,
  candidateCommit: BETA_MIXED_RELEASE_20260925_INCIDENT.candidateCommit,
  runId: String(runId || ''), deployStartedAt: startedAt
});
export const assert20260925BetaAlias = rc => {
  if (rc?.projects?.beta !== BETA_PROJECT_ID || rc?.projects?.production === BETA_PROJECT_ID) fail('Firebase aliases are not Beta-only.');
};
