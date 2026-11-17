import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {verifyBetaWebRelease} from './betaWebReleaseVerification.mjs';
const hash = s=>createHash('sha256').update(s).digest('hex');
const fixture = () => {
 const manifest={sourceCommit:'a'.repeat(40),sourceTree:'b'.repeat(40),protectedBaseline:'c'.repeat(40),buildId:'build',entryAsset:'/assets/index-new.js',entryAssetSha256:hash('script')};
 const live={releaseCommit:manifest.sourceCommit,releaseSourceTree:manifest.sourceTree,releaseProtectedBaseline:manifest.protectedBaseline,releaseBuildId:'build',rootAsset:manifest.entryAsset,storeAsset:manifest.entryAsset};
 const seen=[];
 const args={manifest,expectedCss:[{path:'/assets/index-new.css',sha256:hash('css')}],readLive:async()=>live,fetchImpl:async url=>{
  seen.push(url);
  return url.endsWith('.js')?new Response('script',{headers:{'content-type':'text/javascript'}}):url.endsWith('.css')?new Response('css',{headers:{'content-type':'text/css'}}):new Response('<html><head><link href="/assets/index-new.css"></head><body><div id="root"></div><script src="/assets/index-new.js"></script></body></html>',{headers:{'content-type':'text/html'}});
 }};
 return {args,live,seen};
};
test('post-release verification covers direct navigation, trailing slash, refresh, JavaScript and CSS bytes',async()=>{
 const f=fixture();await verifyBetaWebRelease(f.args);
 assert.equal(f.seen.length,6);assert.ok(f.seen.some(url=>url.includes('release-refresh=build')));
});
for(const [name,change] of [
 ['stale public renderer',f=>f.live.storeAsset='/assets/index-old.js'],
 ['wrong candidate',f=>f.live.releaseCommit='wrong'],
 ['stale direct-navigation HTML',f=>{const fetch=f.args.fetchImpl;f.args.fetchImpl=async url=>url.includes('/store/')?new Response('<div id="root"></div><script src="/assets/index-old.js"></script>',{headers:{'content-type':'text/html'}}):fetch(url);}],
 ['missing JavaScript with HTML fallback',f=>{const fetch=f.args.fetchImpl;f.args.fetchImpl=async url=>url.endsWith('.js')?new Response('<html>',{headers:{'content-type':'text/html'}}):fetch(url);}],
 ['changed asset bytes',f=>{const fetch=f.args.fetchImpl;f.args.fetchImpl=async url=>url.endsWith('.js')?new Response('wrong',{headers:{'content-type':'text/javascript'}}):fetch(url);}],
 ['missing CSS',f=>{const fetch=f.args.fetchImpl;f.args.fetchImpl=async url=>url.endsWith('.css')?new Response('missing',{status:404}):fetch(url);}]
]) test(`post-release gate rejects ${name}`,async()=>{const f=fixture();change(f);await assert.rejects(verifyBetaWebRelease(f.args));});
test('canonical release runs immutable tests before any exact incident repair and still requires live coherence',()=>{
 const source=readFileSync(new URL('./deployBeta.mjs',import.meta.url),'utf8');
 const tests=source.indexOf("path.join(trustedGateRoot, 'scripts', 'runBetaProtectedTests.mjs')");
 const repair=source.indexOf('liveBefore = await repairKnownBetaRendererIncident(');
 const coherence=source.indexOf('  assertLiveBaseline({');
 const deploy=source.indexOf("const result = spawnSync('firebase'");
 const verify=source.indexOf('await verifyBetaWebRelease(');
 assert.ok(tests<repair && repair<coherence && coherence<deploy && deploy<verify);
 assert.match(source,/&& !verifyOnly/);
});
