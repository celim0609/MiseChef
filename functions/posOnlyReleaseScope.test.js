import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

test('Production exports every new POS endpoint and no retired Group Delivery pilot endpoint',()=>{
 const inspect=project=>JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',`const m=await import('./index.js'); console.log(JSON.stringify(Object.entries(m).filter(([,v])=>v?.__endpoint).map(([k])=>k)));`],{cwd:new URL('.',import.meta.url),env:{...process.env,GCLOUD_PROJECT:project,GOOGLE_CLOUD_PROJECT:project},encoding:'utf8'}).trim().split('\n').at(-1));
 const production=inspect('misechef-fa4bf');
 for(const name of ['quoteStorePosDelivery','extractStorePosPasteOrder','manageStorePosOrder','listDeletedStorePosOrders','saveStoreManualPosOrder','createPublicStorePayment','createMiseChefGroupOrder'])assert.ok(production.includes(name),name);
 assert.deepEqual(production.filter(name=>name.includes('MiseChefGroupDelivery')),[]);
 const beta=inspect('misechef-beta-fa4bf');
 assert.ok(beta.includes('reserveMiseChefGroupDelivery'));
});

test('POS-only release removes pilot route and navigation while retaining existing Host Group Orders',()=>{
 const text=path=>readFileSync(new URL(path,import.meta.url),'utf8');
 for(const path of ['../src/App.tsx','../src/modules/public/publicRoutes.ts','../src/modules/public/PublicLayout.tsx','../src/modules/store/StorePosPage.tsx']){
  assert.doesNotMatch(text(path),/PublicGroupDeliveryPage|GroupDeliveryReviewPanel|canReviewGroupDelivery|group-delivery/);
 }
 assert.match(text('../src/modules/public/publicRoutes.ts'),/page: 'group'/);
});
