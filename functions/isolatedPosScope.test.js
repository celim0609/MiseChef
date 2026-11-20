import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
// Immutable current Production 8038706 baseline contract for this isolated POS release.
const unchanged = {
  "functions/index.js": "31e48f4a3e3d5d3ee65eccd5274dcc403dea127e9b5551f6a03b8e9eb047796a",
  "functions/entry.js": "d637eaab9d24462967b8b26a683d081e7b6eb703f4e2659a17e557caefc76bf4",
  "functions/storePayments.js": "4a3d52df9a42561094752184b79a054cb13440ab334a2348faa5248f01295b29",
  "functions/storePaymentsCore.js": "fcb40e6941044a4063b886a8eff5f7287fa3872a33149f02d7db5a778ddc6689",
  "functions/storeWeeklyMealPlan.js": "0ec5460d55aba50a79006927a7bcfff22f589b1a4641a8097b65150842bcedbc",
  "functions/storeOrderFulfilments.js": "b66e1dc0c5f47a487e60e4ef41ec7d7a6ccbef67639d4c93180ad814568268a2",
  "functions/storeProductAvailability.js": "8cac5d54649908477678b178823ae56538150127c71e9d3a4e10e613b9810421",
  "functions/paymentProviders/curlecPaymentLink.js": "7d27e779adc905fa5f47faba0714269e27efeef10574869dd40b6e78ba33dee2",
  "functions/paymentProviders/curlecStandardCheckout.js": "ca8bc9cfdfc0e5ada7bb9a883c379ec4e8e7ad41bf0d761d62686746e2960ec5",
  "functions/paymentProviders/stripeSingleMerchant.js": "7fbe0cf629c0375e305bb0fe31c00dae5b325682e617e8095814b5e22d64c475",
  "functions/externalPosOrders.js": "3cc62ceb4bcc5543aa65fd1b9c97f7b1dd92f4bcd4de27b3f568416c744c1bd1",
  "functions/storeFulfilment.js": "dc92d8b90f590c6aca57a9d5619bbe736af88432ce8226214eba3f05b900d6ad",
  "functions/storeDelivery.js": "9633e358aaf004c04ce9145c1c94e1e4dc5e4e027e442deb277db9b81fce8fef",
  "functions/storeManualDelivery.js": "ec5c02a4c2d8f40c309ada03e84656f386a007cbc198ce40f4b4b9fd7851cd78",
  "functions/posDeliveryQuotes.js": "60756314dc2e70dde278f48c08a4b276581d16bd8eb8eb7306088d2e048e04e6",
  "firestore.rules": "a59b8166570fe3f76c6b67598633bceeb655e07499126aa76ba08bf4e0658aea",
  "firestore.indexes.json": "f02a469d27df1e8961d85c0d29e26eb1369956f92af361be457bcae161c267dc",
  "storage.rules": "1e5f500c873650b41d9f995e4659a3783cb8b036795f51155f28e58675821966",
  "firebase.json": "afaff8a3856261bee4ed66dbc14796c032866b4a5081748359af485109ccb87f",
  ".firebaserc": "485576bdfb606982c379abed53fa43f886d1bbe14b11565b60b1c9a8d5c83517",
  "functions/weeklyMenuSharing.js": "71f181e006253bfe07b4d0c60012e250e89d5bccc2a2eea14930daec07cf9650",
  "src/modules/store/PublicStorePage.tsx": "db6aec274b04daf293834833e70a79b824ff1df4216fc4fcd1e9e344ff877b18",
  "src/modules/store/storeModel.ts": "25c694c73dd06ce22bbb89fca2d4c7cae67ad037ea4ac5bafd4322b1e01f41af",
  "src/modules/store/storeProductVisibility.ts": "92295acaeab0fb12fe59ecbb240dabd1399e6d0cb2facf2bcf76380d763a3d92",
  "functions/week4Mapping.test.js": "4962f251d3b9d3bbd1d99f8421a7e726dd9a019101c5bd6f2628ce8956b225a0"
};
test('isolated POS release preserves Production gateway, webhook, customer, delivery, Rules and configuration bytes',()=>{
 for(const [file,hash] of Object.entries(unchanged))
  assert.equal(createHash('sha256').update(readFileSync(new URL('../'+file,import.meta.url))).digest('hex'),hash,file);
 for(const file of ['weeklyPosPaymentLink.js','curlecEnvironment.js','groupDelivery.js'])
  assert.equal(existsSync(new URL('./'+file,import.meta.url)),false,file);
 const fixture=new URL('./fixtures/productionWeeklyMenu.json',import.meta.url);
 if(existsSync(fixture))assert.doesNotMatch(readFileSync(fixture,'utf8'),/token=|firebasestorage\.googleapis\.com/);
 const page=readFileSync(new URL('../src/modules/store/StorePosPage.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(page,/weeklyPosPaymentProviders|manageWeeklyPosPaymentLink|Generate Payment Link|GroupDeliveryReviewPanel/);
});
