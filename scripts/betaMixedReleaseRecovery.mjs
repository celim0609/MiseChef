import { BETA_PROJECT_ID, MANDATORY_BETA_BASELINE } from './betaDeploymentSafety.mjs';

export const BETA_MIXED_RELEASE_INCIDENT = Object.freeze({
  id: 'beta-mixed-release-2026-09-24',
  confirmation: 'RECOVER BETA MIXED RELEASE 20260924',
  authorization: 'beta-mixed-release-2026-09-24:1c6b8680bb139ff0c011375ce8ff79d42aea0f99',
  candidateCommit: '1c6b8680bb139ff0c011375ce8ff79d42aea0f99',
  candidateSourceTree: '14d77de163371d27184f0e1cbc4cb7e1416fb3c3',
  live: Object.freeze({
    rootAsset: '/assets/index-BKXk7Nzq.js',
    storeAsset: '/assets/index-Cm6I4Suu.js',
    releaseCommit: '28c564bb86f2428d9e23f763b0e81cffda39c381',
    releaseSourceTree: 'c0b291d26246b248e58d4d809392051247ce7b6e',
    releaseProtectedBaseline: MANDATORY_BETA_BASELINE,
    releaseBuildId: '3c9e6856-25ad-412c-be7e-6c4c6763206b',
    releaseStoreShellAsset: '/assets/index-Bi5Pqjce.js'
  }),
  consumptionMarker: 'gs://misechef-beta-fa4bf.firebasestorage.app/misechef-release-guards/beta-mixed-release-2026-09-24.json'
});

const fail = message => { throw new Error(`Beta mixed-release recovery refused: ${message}`); };

export const assertRecoveryMode = ({ confirmation, authorization, githubActions, ciLockId }) => {
  if (confirmation !== BETA_MIXED_RELEASE_INCIDENT.confirmation) fail('the recovery confirmation is not exact.');
  if (authorization !== BETA_MIXED_RELEASE_INCIDENT.authorization) fail('the Beta environment authorization is not exact.');
  if (githubActions !== true || ciLockId !== 'misechef-beta-deployment') fail('recovery is permitted only in the locked protected Beta workflow.');
};

export const assertExactCandidate = ({ head, sourceTree, isAncestor }) => {
  if (head !== BETA_MIXED_RELEASE_INCIDENT.candidateCommit || sourceTree !== BETA_MIXED_RELEASE_INCIDENT.candidateSourceTree) fail('candidate SHA or source tree differs from the approved recovery candidate.');
  if (!isAncestor(BETA_MIXED_RELEASE_INCIDENT.live.releaseCommit, head)) fail('candidate does not descend from the manifest-bearing live Beta commit.');
};

export const assertBetaProjectAlias = firebaseRc => {
  if (firebaseRc?.projects?.beta !== BETA_PROJECT_ID) fail('the beta alias does not resolve to the protected Beta project.');
  if (firebaseRc?.projects?.production === BETA_PROJECT_ID) fail('the production alias unexpectedly resolves to the Beta project.');
  if (firebaseRc?.projects?.beta === firebaseRc?.projects?.production) fail('beta and production aliases must not resolve to the same project.');
};

export const assertExpectedMixedLiveState = live => {
  const expected = BETA_MIXED_RELEASE_INCIDENT.live;
  for (const [key, value] of Object.entries(expected)) {
    if (live?.[key] !== value) fail(`live ${key} changed from the recorded incident state.`);
  }
};

export const assertIncidentAvailable = marker => {
  if (marker) fail('incident is already consumed by a Firebase deploy start and cannot be retried.');
};

export const createConsumptionMarker = ({ runId, startedAt = new Date().toISOString() }) => ({
  incident: BETA_MIXED_RELEASE_INCIDENT.id,
  candidateCommit: BETA_MIXED_RELEASE_INCIDENT.candidateCommit,
  runId,
  deployStartedAt: startedAt
});

export const assertRecoveredRelease = ({ live, manifest, renderPublicStoreBefore, renderPublicStoreAfter }) => {
  if (live?.releaseCommit !== manifest?.sourceCommit || live?.releaseSourceTree !== manifest?.sourceTree || live?.releaseProtectedBaseline !== MANDATORY_BETA_BASELINE) fail('live manifest does not identify the approved candidate.');
  if (!live?.rootAsset || live.rootAsset !== manifest?.entryAsset || live.storeAsset !== manifest?.entryAsset) fail('root Hosting and public Store assets do not converge to the manifest entry asset.');
  if (manifest?.storeShellAsset !== manifest?.entryAsset) fail('generated Store shell does not match the manifest entry asset.');
  if (!renderPublicStoreAfter?.latestReadyRevision || renderPublicStoreAfter.latestReadyRevision === renderPublicStoreBefore?.latestReadyRevision) fail('renderPublicStore did not advance to a new ready revision.');
  const traffic = renderPublicStoreAfter.trafficStatuses || [];
  if (!traffic.length || traffic.reduce((sum, item) => sum + Number(item.percent || 0), 0) !== 100 || !traffic.every(item => item.type === 'TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST' || item.revision === renderPublicStoreAfter.latestReadyRevision)) fail('renderPublicStore is not serving 100% traffic from its ready revision.');
};
