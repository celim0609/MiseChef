import assert from 'node:assert/strict';
import test from 'node:test';
import { assertTicketPreviewScope, TICKET_PREVIEW_PATHS } from './ticketBetaPreviewSafety.mjs';
const baseline='a'.repeat(40), expected='b'.repeat(40);
const authority={expected,approved:expected,resolved:expected,baseline,liveProduction:baseline,changedPaths:[...TICKET_PREVIEW_PATHS],ancestor:true,ref:'refs/heads/main',event:'workflow_dispatch'};
test('accepts exact approved ticket candidate on unchanged live Production lineage',()=>assert.doesNotThrow(()=>assertTicketPreviewScope(authority)));
test('rejects every protected integration and deployment surface',()=>{
 for(const path of ['functions/storePayments.js','functions/storePaymentsCore.js','functions/storeDelivery.js','functions/storeDeliveryPricing.js','src/modules/store/whatsappOrderConfirmation.ts','src/modules/store/types.ts','firestore.rules','.github/workflows/deploy-production.yml','scripts/deployProduction.mjs']) assert.throws(()=>assertTicketPreviewScope({...authority,changedPaths:[path]}),/only/);
});
test('requires exact immutable SHA approval, protected main dispatch and unchanged ancestry',()=>{
 for(const change of [{expected:'main'},{approved:baseline},{resolved:baseline},{liveProduction:expected},{ancestor:false},{changedPaths:[]},{ref:'refs/heads/feature'},{event:'push'}]) assert.throws(()=>assertTicketPreviewScope({...authority,...change}));
});
