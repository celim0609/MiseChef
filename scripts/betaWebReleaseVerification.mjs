import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readLiveBetaFingerprint } from './betaLiveRelease.mjs';
const origin = 'https://misechef-beta-fa4bf.web.app';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const stylesheetPaths = html => [...html.matchAll(/<link[^>]*href=["'](\/assets\/[^"']+\.css)["']/gi)].map(match=>match[1]).sort();
export async function verifyBetaWebRelease({manifest, expectedCss = [], readLive = readLiveBetaFingerprint, fetchImpl = fetch}) {
  const live = await readLive();
  for (const [key,value] of Object.entries({releaseCommit:manifest.sourceCommit,releaseSourceTree:manifest.sourceTree,releaseProtectedBaseline:manifest.protectedBaseline,releaseBuildId:manifest.buildId,rootAsset:manifest.entryAsset,storeAsset:manifest.entryAsset})) assert.equal(live[key],value,`Live Beta ${key} differs from built release`);
  const nonce = encodeURIComponent(manifest.buildId);
  // Direct navigation, trailing-slash navigation and a cache-busted refresh.
  for (const route of ['/', '/store/misechef-s-grab-go-store', '/store/misechef-s-grab-go-store/', `/store/misechef-s-grab-go-store?release-refresh=${nonce}`]) {
    const response = await fetchImpl(origin+route,{cache:'no-store',headers:{'Cache-Control':'no-cache, no-store'}});
    assert.equal(response.status,200,`Public navigation failed: ${route}`);
    assert.match(response.headers.get('content-type') || '',/text\/html/i);
    const html = await response.text();
    const script = html.match(/<script[^>]+src=["']([^"']*\/assets\/index-[^"']+\.js)["']/i)?.[1];
    assert.equal(script,manifest.entryAsset,`Public navigation returned a stale shell: ${route}`);
    assert.match(html,/<div id="root"><\/div>/);
    assert.deepEqual(stylesheetPaths(html),expectedCss.map(asset=>asset.path).sort(),`Public navigation CSS differs: ${route}`);
  }
  for (const asset of [{path:manifest.entryAsset,sha256:manifest.entryAssetSha256,type:/javascript/i}, ...expectedCss.map(asset=>({...asset,type:/text\/css/i}))]) {
    const response = await fetchImpl(origin+asset.path,{cache:'no-store'});
    assert.equal(response.status,200,`Release asset missing: ${asset.path}`);
    assert.match(response.headers.get('content-type') || '',asset.type,`Release asset returned the wrong MIME type: ${asset.path}`);
    assert.equal(sha256(Buffer.from(await response.arrayBuffer())),asset.sha256,`Release asset hash differs: ${asset.path}`);
  }
  return live;
}
