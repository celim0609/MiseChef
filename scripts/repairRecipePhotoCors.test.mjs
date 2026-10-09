import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { repairRecipePhotoCors } from './repairRecipePhotoCors.mjs';
const policy = JSON.parse(readFileSync(new URL('../config/storage/production-cors.json', import.meta.url), 'utf8'));
const fixture = (cors) => {
 let current = cors; let writes = 0; const requests = [];
 return {
  bucket: { name: 'misechef-fa4bf.firebasestorage.app', getMetadata: async () => [{ cors: current }], setCorsConfiguration: async value => { current = value; writes++; }, getFiles: async () => [[{ name: 'recipes/owner/existing/cover.jpg', metadata: { contentType: 'image/jpeg', metadata: { firebaseStorageDownloadTokens: 'private-token' } } }]] },
  fetchImage: async (url, init) => { requests.push({ url, init }); return new Response('image', { headers: { 'access-control-allow-origin': init.headers.Origin } }); },
  requests, writes: () => writes
 };
};
test('missing CORS is repaired only on verified bucket and checked using existing photos from both Production origins', async () => {
 const f=fixture(); await repairRecipePhotoCors({ ...f, policy });
 assert.equal(f.writes(),1);
 assert.deepEqual(f.requests.map(r=>r.init.headers.Origin),policy[0].origin);
 for(const request of f.requests) { assert.equal(request.url.searchParams.get('token'),'private-token'); assert.ok(request.url.searchParams.get('recipePhotoTransfer')); }
});
test('already approved CORS is idempotent; unexpected policy or bucket fails without writes', async () => {
 const f=fixture(policy); await repairRecipePhotoCors({ ...f, policy }); assert.equal(f.writes(),0);
 const unexpected=fixture([{origin:['https://other.example']}]); await assert.rejects(repairRecipePhotoCors({...unexpected,policy}),/requires review/);assert.equal(unexpected.writes(),0);
 await assert.rejects(repairRecipePhotoCors({...f,bucket:{...f.bucket,name:'misechef-beta-fa4bf.firebasestorage.app'},policy}),/verified Production/);
 await assert.rejects(repairRecipePhotoCors({...f,policy:[{...policy[0],origin:['*']}]}),/approved policy/);
});
test('HTTP success without CORS never passes verification', async () => {
 const f=fixture(policy); await assert.rejects(repairRecipePhotoCors({...f,policy,fetchImage:async()=>new Response('image')}),/CORS response verification failed/);
});
test('missing existing image prevents claiming an actual origin verification', async () => {
 const f=fixture(policy);await assert.rejects(repairRecipePhotoCors({...f,bucket:{...f.bucket,getFiles:async()=>[[]]},policy}),/No existing Recipe image/);
});
test('CORS repair stays behind human Production environment and exact authority verification', () => {
 const workflow=readFileSync(new URL('../.github/workflows/deploy-production.yml',import.meta.url),'utf8');
 const step=workflow.indexOf('Apply and verify approved Recipe image CORS');
 assert.ok(step>workflow.indexOf('environment: production'));
 assert.ok(step>workflow.indexOf('Verify candidate equals external Production authority'));
 assert.ok(step>workflow.indexOf('Authenticate to Production only'));
 assert.ok(step<workflow.indexOf('Run canonical protected full-resource Production release'));
 const script=readFileSync(new URL('./repairRecipePhotoCors.mjs',import.meta.url),'utf8');assert.match(script,/assertProductionAuthority/);assert.match(script,/GITHUB_ACTIONS/);
});


test('Google metadata key order is irrelevant while actual policy differences fail closed', async () => {
 const reordered=policy.map(p=>({maxAgeSeconds:p.maxAgeSeconds,responseHeader:p.responseHeader,method:p.method,origin:p.origin}));
 const f=fixture(reordered);await repairRecipePhotoCors({...f,policy});assert.equal(f.writes(),0);
 for(const changed of [{...policy[0],maxAgeSeconds:7200},{...policy[0],origin:[...policy[0].origin,'*']},{...policy[0],method:['GET']}]) {
  const other=fixture([changed]);await assert.rejects(repairRecipePhotoCors({...other,policy}),/requires review/);assert.equal(other.writes(),0);
 }
});
