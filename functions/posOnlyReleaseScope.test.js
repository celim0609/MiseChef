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

test('Group Delivery entry points require the Beta project and preserve Host Group Orders', () => {
 const text = path => readFileSync(new URL(path, import.meta.url), 'utf8');
 assert.match(text('../src/App.tsx'), /canReviewGroupDelivery=\{import.meta.env.VITE_FIREBASE_PROJECT_ID === 'misechef-beta-fa4bf'/);
 assert.match(text('../src/modules/public/PublicLayout.tsx'), /route.page === 'group-delivery'\) return import.meta.env.VITE_FIREBASE_PROJECT_ID === 'misechef-beta-fa4bf'/);
 assert.match(text('../src/modules/public/publicRoutes.ts'), /page: 'group'/);
});
