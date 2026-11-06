import test from 'node:test';
import assert from 'node:assert/strict';
import {createPosPlaces,consumePosQuoteRate} from './posPlaces.js';
for (const projectId of ['misechef-fa4bf','misechef-beta-fa4bf']) {
 test(`POS Places resolves MY pin billed to exact ${projectId}`,async()=>{
  const places=createPosPlaces({projectId,accessToken:async()=> 'test-token',fetchImpl:async(url,options)=>{
   assert.equal(options.headers['X-Goog-User-Project'],projectId);
   assert.match(url,/^https:\/\/places.googleapis.com\/v1\/places\/public-place/);
   return {ok:true,json:async()=>({id:'public-place',formattedAddress:'Public Ipoh address',addressComponents:[{types:['country'],shortText:'MY'}],location:{latitude:4.6,longitude:101.1}})};
  }});
  assert.deepEqual(await places.resolve('public-place'),{formattedAddress:'Public Ipoh address',latitude:4.6,longitude:101.1});
 });
}
test('POS Places fails closed for unknown project and non-Malaysian result',async()=>{
 assert.throws(()=>createPosPlaces({projectId:'other'}),/configured Firebase project/);
 const places=createPosPlaces({projectId:'misechef-fa4bf',accessToken:async()=> 'test',fetchImpl:async()=>({ok:true,json:async()=>({id:'p',formattedAddress:'Wrong country',addressComponents:[{types:['country'],shortText:'SG'}],location:{latitude:1,longitude:103}})})});
 await assert.rejects(places.resolve('p'),/Malaysian address/);
});
test('POS quote rate guard uses isolated server namespace and rejects limit before write',async()=>{
 let written=false;
 const db={collection:name=>{assert.equal(name,'posQuoteRateLimits');return{doc:uid=>{assert.equal(uid,'operator');return{};}}},runTransaction:async fn=>fn({get:async()=>({data:()=>({windowStart:1000,count:30})}),set:()=>{written=true;}})};
 await assert.rejects(consumePosQuoteRate({db,uid:'operator',now:new Date(2000)}),/wait a minute/);
 assert.equal(written,false);
});
