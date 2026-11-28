import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
// Phase 1 is presentation only: pin accepted money, permissions, delivery, history and Rules contracts.
const pins={
  "functions/storePromotionPricing.js": "10fd12a93fb257fde306fadd7de90f21ce5fabc6f9c2eb9da97b4f46e62c0b82",
  "functions/manualPosOrders.js": "3af47810cfe4699312085c904cb883c2038b25552aadddcf5fb54489040ddc3b",
  "functions/externalPosOrders.js": "6e1d22da9b98fd2466fc4f1b31e95a0d176b29812983c3828aa4a8d70c1efcfc",
  "functions/posDeliveryQuotes.js": "60756314dc2e70dde278f48c08a4b276581d16bd8eb8eb7306088d2e048e04e6",
  "functions/storePayments.js": "4a3d52df9a42561094752184b79a054cb13440ab334a2348faa5248f01295b29",
  "functions/storePaymentsCore.js": "fcb40e6941044a4063b886a8eff5f7287fa3872a33149f02d7db5a778ddc6689",
  "functions/index.js": "f32a48763a813f5122107e75e827aec00a9c89c5da7d40334e1341d4a14ca73c",
  "firestore.rules": "7f39af95b11b4782a34c0d2d6bba0a1fc3ea3f0a7e85b0fb09c002f01493efd3",
  "firestore.indexes.json": "ef8c0c8c3e401b8b66d26b8afc47ddd993e490a08d10c299b4ed9384fd5f3c4f",
  "src/modules/store/UpcomingDateSelector.tsx": "d97f1546b0455f5da1b05b8d1147963a9f6d92f7fe243eeaf9a62d41330dfc30",
  "src/modules/store/orderBrowserModel.ts": "d9b090ed7da88648c57bc58a793203b84116ed951d1ce31badcec2041bb0a614",
  "src/modules/store/posOrderModel.ts": "af8309866a4bf5f782eca16d87e9df8dc26c64e7a56c7581a6527121390aa10d",
  "src/modules/store/services/posHistorySearchService.ts": "2adf9fe058c2caf3da42cdf3484f1258309f20755cc95fd7a379c557ce1dc9bb",
  "src/modules/store/WhatsAppCustomerActions.tsx": "304d4972c29082918996f7819402339b6bb7118d576bb3c4cda55daa9a468acb",
  "src/modules/store/PosWeeklyMenu.tsx": "1f8cc4b18c02b20b29d11d8a688d0d4c3ff298d6aa26b2e7132437dd081ed5bd",
  "src/modules/store/storeSetModel.ts": "89e3a2e7a1f64cd77103dd9fff5368c57998ceb73a61c5cb8c606923bc85f3e4",
  "src/modules/business/accounting.ts": "073f7ea8fac231c58db6658467571d2691205f4bebc216bc3d06bd59cef79813",
  "src/modules/business/dailySalesProjection.ts": "f0bfd9bc160d7ba0ae1fb7b929eb12beb4d11a373fa385d77722e0a1011eb273"
};
test('POS UI refinement preserves accepted financial, delivery, permissions, date and history code bytes',()=>{
 for(const [file,hash] of Object.entries(pins))assert.equal(createHash('sha256').update(readFileSync(new URL('../../../'+file,import.meta.url))).digest('hex'),hash,file);
});

test('Production Manual Order submission, quote, confirmation and permission state stays unchanged',()=>{
 const source=readFileSync(new URL('./ManualPosOrders.tsx',import.meta.url),'utf8');
 const originalState=source.slice(source.indexOf('  const [open'),source.indexOf('\n  useEffect(()=>{onPendingCountChange'));
 assert.equal(createHash('sha256').update(originalState).digest('hex'),'41fd1674c25c81b50389a15658f741865c3fbc867b82f22a240667ccc0cf3361');
 assert.ok(!source.includes('WeeklyPosPaymentActions'));
 assert.match(source,/editing\?\.manualOrder\?\.posAddOrder/);
});
