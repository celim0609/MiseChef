import { sha256 } from './betaDeploymentSafety.mjs';

export const CURLEC_PAYMENT_LINK_BETA_RECOVERY = Object.freeze({
  id: 'curlec-payment-link-beta-hosting-store-split',
  confirmation: 'RECOVER CURLEC PAYMENT LINK BETA',
  priorCommit: '6aa741c43d93211523339722feecae562b48c39b',
  priorSourceTree: 'd88c537dfc8225aa711390c920d36757f1bac0c9',
  protectedBaseline: '06a37c0d30c47e037994454119a0461955df4ee3',
  rootAsset: '/assets/index-3M97y8QZ.js',
  storeAsset: '/assets/index-BC0QZkkS.js',
  candidateCommit: '2f998c7ef4810d71c0a88f050ff40cd9a9cbb943',
  candidateSourceTree: '1a47bf4d0dd77885ba84c0f866e4988d6b58dcea',
  candidateAsset: '/assets/index-BC0QZkkS.js'
});

export const assertCurlecPaymentLinkBetaPartialState = ({ head, sourceTree, liveFingerprint }) => {
  const incident = CURLEC_PAYMENT_LINK_BETA_RECOVERY;
  if (head !== incident.candidateCommit || sourceTree !== incident.candidateSourceTree) {
    throw new Error('Curlec Payment Link recovery candidate is not the exact authorized SHA and tree.');
  }
  if (
    liveFingerprint?.releaseCommit !== incident.priorCommit ||
    liveFingerprint?.releaseSourceTree !== incident.priorSourceTree ||
    liveFingerprint?.releaseProtectedBaseline !== incident.protectedBaseline ||
    liveFingerprint?.rootAsset !== incident.rootAsset ||
    liveFingerprint?.storeAsset !== incident.storeAsset
  ) {
    throw new Error('Live Beta state is not the exact authorized Curlec Payment Link partial release.');
  }
  return { incidentId: incident.id, fingerprint: sha256(JSON.stringify(liveFingerprint)) };
};

export const assertCurlecPaymentLinkRecoveryArtifact = manifest => {
  const incident = CURLEC_PAYMENT_LINK_BETA_RECOVERY;
  if (
    manifest?.sourceCommit !== incident.candidateCommit ||
    manifest?.sourceTree !== incident.candidateSourceTree ||
    manifest?.protectedBaseline !== incident.protectedBaseline ||
    manifest?.entryAsset !== incident.candidateAsset ||
    manifest?.storeShellAsset !== incident.candidateAsset
  ) throw new Error('Curlec Payment Link recovery artifact is not the exact authorized build.');
};

export const assertCurlecPaymentLinkRecoveryConverged = ({ liveFingerprint, manifest, assetProof }) => {
  const incident = CURLEC_PAYMENT_LINK_BETA_RECOVERY;
  if (
    liveFingerprint?.releaseCommit !== incident.candidateCommit ||
    liveFingerprint?.releaseSourceTree !== incident.candidateSourceTree ||
    liveFingerprint?.releaseProtectedBaseline !== incident.protectedBaseline ||
    liveFingerprint?.rootAsset !== incident.candidateAsset ||
    liveFingerprint?.storeAsset !== incident.candidateAsset
  ) throw new Error('Recovered Beta Hosting and public Store do not identify the authorized candidate.');
  assertCurlecPaymentLinkRecoveryArtifact(manifest);
  if (assetProof?.status !== 200 || !/^(?:application|text)\/javascript(?:;|$)/i.test(String(assetProof?.contentType || '')) || assetProof?.sha256 !== manifest.entryAssetSha256) {
    throw new Error('Recovered Beta entry asset is not the expected JavaScript bytes.');
  }
};
