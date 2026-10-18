import test from 'node:test';
import assert from 'node:assert/strict';
import { assertWhatsAppPreviewScope, WHATSAPP_PREVIEW_PATHS } from './whatsappBetaPreviewSafety.mjs';
const context = { expected: 'a'.repeat(40), approved: 'a'.repeat(40), resolved: 'a'.repeat(40), baseline: 'b'.repeat(40), liveProduction: 'b'.repeat(40), changedPaths: WHATSAPP_PREVIEW_PATHS, ancestor: true, ref: 'refs/heads/main', event: 'workflow_dispatch' };
test('exact approved WhatsApp-only descendant may use isolated preview', () => assert.doesNotThrow(() => assertWhatsAppPreviewScope(context)));
for (const file of ['functions/storePaymentsCore.js', 'functions/storeDelivery.js', 'firestore.rules', '.github/workflows/deploy-production.yml', 'src/modules/store/PublicStorePage.tsx']) {
  test(`rejects extra release scope: ${file}`, () => assert.throws(() => assertWhatsAppPreviewScope({ ...context, changedPaths: [...WHATSAPP_PREVIEW_PATHS, file] }), /only WhatsApp/));
}
for (const change of [{ expected: 'c'.repeat(40) }, { liveProduction: 'd'.repeat(40) }, { ancestor: false }, { ref: 'refs/heads/feature' }, { event: 'push' }]) {
  test(`rejects stale/unapproved authority ${JSON.stringify(change)}`, () => assert.throws(() => assertWhatsAppPreviewScope({ ...context, ...change })));
}
