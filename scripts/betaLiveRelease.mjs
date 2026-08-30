import { sha256 } from './betaDeploymentSafety.mjs';

const extractAsset = html => {
  const match = String(html).match(/(?:src=|src\\?=)["']([^"']*\/assets\/index-[^"']+\.js)["']/i);
  return match ? new URL(match[1], 'https://misechef.invalid').pathname : null;
};

const fetchText = async url => {
  const response = await fetch(url, {
    headers: { 'Cache-Control': 'no-cache, no-store' },
    redirect: 'follow'
  });
  if (!response.ok) throw new Error(`Unable to read live Beta release state: ${url} returned ${response.status}.`);
  return {
    text: await response.text(),
    etag: response.headers.get('etag') || ''
  };
};

export const readLiveBetaFingerprint = async ({
  origin = 'https://misechef-beta-fa4bf.web.app',
  storePath = '/store/misechef-s-grab-go-store'
} = {}) => {
  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const [root, store, release] = await Promise.all([
    fetchText(`${origin}/?beta-release-check=${nonce}`),
    fetchText(`${origin}${storePath}?beta-release-check=${nonce}`),
    fetchText(`${origin}/.well-known/misechef-beta-release.json?beta-release-check=${nonce}`)
      .catch(() => ({ text: '', etag: '' }))
  ]);

  let releaseMetadata = null;
  try {
    const parsed = JSON.parse(release.text);
    if (parsed?.kind === 'misechef-beta-release') releaseMetadata = parsed;
  } catch {
    releaseMetadata = null;
  }

  return {
    rootAsset: extractAsset(root.text),
    storeAsset: extractAsset(store.text),
    releaseCommit: releaseMetadata?.sourceCommit || null,
    releaseSourceTree: releaseMetadata?.sourceTree || null,
    releaseProtectedBaseline: releaseMetadata?.protectedBaseline || null,
    releaseBuildId: releaseMetadata?.buildId || null,
    rootEtag: root.etag,
    storeEtag: store.etag,
    fingerprint: sha256(JSON.stringify({
      rootAsset: extractAsset(root.text),
      storeAsset: extractAsset(store.text),
      releaseMetadata,
      rootEtag: root.etag,
      storeEtag: store.etag
    }))
  };
};
