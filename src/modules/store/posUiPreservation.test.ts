import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
// Phase 1 is presentation only: pin accepted money, permissions, delivery, history and Rules contracts.
const pins={
  "functions/storePromotionPricing.js": "10fd12a93fb257fde306fadd7de90f21ce5fabc6f9c2eb9da97b4f46e62c0b82",
  "functions/manualPosOrders.js": "6673f6833d53b3cfbb2acc6a518c6a6e6f2dddd57bda53b1aac07ad0f1026dbd",
  "functions/externalPosOrders.js": "1626d0cf1070b699a6dde1cd07f4877a75f606d32fd90a39697c47ead7295809",
  "functions/posDeliveryQuotes.js": "12368a953f0e185753e990d2af8e611cc3f6d558190d576aef3ae49886d88498",
  "functions/storePayments.js": "3670b5d13d7ca7ad795ff88b7a56dcdb6806fb180db3cad1ba93b88d631ce5a8",
  "functions/storePaymentsCore.js": "e02bf7dc8360b752726de9e6901710932ec26d855229076e0e1241a7be769443",
  "functions/index.js": "16a304d8866b846d724e2ce3d7fee708817f3e119fd90b182e6d46a0359a0eec",
  "firestore.rules": "0cf99f057fcf8c2189e78201b74ef399707836722e4750be7a0c2ecce52e69ac",
  "firestore.indexes.json": "5517f04e5cd9d64d15ff69c033841bfa426e83820b448e1ee66184de526483f0",
  "src/modules/store/UpcomingDateSelector.tsx": "d97f1546b0455f5da1b05b8d1147963a9f6d92f7fe243eeaf9a62d41330dfc30",
  "src/modules/store/orderBrowserModel.ts": "d9b090ed7da88648c57bc58a793203b84116ed951d1ce31badcec2041bb0a614",
  "src/modules/store/posOrderModel.ts": "bdb35b8248b4a171af9fee57620a629531f36476ca847035e21bd3077d0b605f",
  "src/modules/store/services/posHistorySearchService.ts": "45f7586021bdfea78af6fcc800a7539b50ffa7656207f6c68741836b8375a7b3",
  "src/modules/store/WhatsAppCustomerActions.tsx": "304d4972c29082918996f7819402339b6bb7118d576bb3c4cda55daa9a468acb",
  "src/modules/store/PosWeeklyMenu.tsx": "d3f21ca82b97ef1318cdf9deed2918a3f287f4403336eb592f4365ff647cf4de",
  "src/modules/store/storeSetModel.ts": "89e3a2e7a1f64cd77103dd9fff5368c57998ceb73a61c5cb8c606923bc85f3e4",
  "src/modules/business/accounting.ts": "073f7ea8fac231c58db6658467571d2691205f4bebc216bc3d06bd59cef79813",
  "src/modules/business/dailySalesProjection.ts": "0ccfde89fa321863c5905cbb299d89d9141f03a092a71d4411460977b6d00bea"
};
test('POS UI refinement preserves accepted financial, delivery, permissions, date and history code bytes',()=>{
 for(const [file,hash] of Object.entries(pins))assert.equal(createHash('sha256').update(readFileSync(new URL('../../../'+file,import.meta.url))).digest('hex'),hash,file);
});
