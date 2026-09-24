import { createHash } from 'node:crypto';
import { readLiveBetaFingerprint } from './betaLiveRelease.mjs';
import { readCloudRunServiceState, readLiveAssetProof, readLiveReleaseMetadata } from './betaRun33530702897Recovery.mjs';

export const createBetaHostingReader = request => async () => {
  const response = await request({ method: 'GET', url: 'https://firebasehosting.googleapis.com/v1beta1/sites/misechef-beta-fa4bf/releases', params: { pageSize: 1 } });
  const version = response.data?.releases?.[0]?.version?.name;
  if (!version) throw new Error('Live Beta Hosting release/version is unreadable.');
  return version;
};

export const readDurableBetaLiveState = async ({ readFingerprint = readLiveBetaFingerprint, readMetadata = readLiveReleaseMetadata, readAsset = readLiveAssetProof, readHostingVersion, readServices } = {}) => {
  if (typeof readHostingVersion !== 'function' || typeof readServices !== 'function') throw new Error('Durable Beta live-state readers are required.');
  const [fingerprint, metadata, hostingVersion, services] = await Promise.all([readFingerprint(), readMetadata(), readHostingVersion(), readServices()]);
  const [root, store] = await Promise.all([
    readAsset({ origin: 'https://misechef-beta-fa4bf.web.app', asset: fingerprint.rootAsset }),
    readAsset({ origin: 'https://misechef-beta-fa4bf.web.app', asset: fingerprint.storeAsset })
  ]);
  if (root.status !== 200 || store.status !== 200) throw new Error('Live Beta root or Store asset is unreadable.');
  const render = services.find(item => item.id === 'renderPublicStore');
  if (!render?.latestReadyRevision) throw new Error('Live Beta renderPublicStore revision is unreadable.');
  return {
    rootAsset: fingerprint.rootAsset, storeAsset: fingerprint.storeAsset,
    rootAssetSha256: root.sha256, storeAssetSha256: store.sha256,
    releaseCommit: fingerprint.releaseCommit, releaseSourceTree: fingerprint.releaseSourceTree,
    releaseProtectedBaseline: fingerprint.releaseProtectedBaseline, releaseBuildId: fingerprint.releaseBuildId,
    releaseStoreShellAsset: metadata?.storeShellAsset || '', hostingVersion,
    renderPublicStoreRevision: render.latestReadyRevision,
    durableFingerprint: createHash('sha256').update(JSON.stringify({ rootAsset: fingerprint.rootAsset, storeAsset: fingerprint.storeAsset, rootAssetSha256: root.sha256, storeAssetSha256: store.sha256, metadata, hostingVersion, renderPublicStoreRevision: render.latestReadyRevision })).digest('hex')
  };
};
