import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

export async function seed() {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9099');
  const require = createRequire(new URL('../functions/package.json', import.meta.url));
  const { initializeApp, deleteApp } = require('firebase-admin/app');
  const { getAuth } = require('firebase-admin/auth');
  const { getFirestore } = require('firebase-admin/firestore');
  const app = initializeApp({ projectId: 'demo-misechef-preview' });
  const db = getFirestore(app);
  try {
    for (const role of ['Owner', 'Manager']) {
      const uid = `synthetic-${role.toLowerCase()}`;
      await getAuth(app).createUser({
        uid, email: `${role.toLowerCase()}@example.test`, password: 'LocalSyntheticOnly42!'
      });
      await db.doc(`workspaceMembers/store-qa_${uid}`).set({
        workspaceId: 'store-qa', userId: uid, role, status: 'Active'
      });
    }
    await db.doc('workspaces/store-qa').set({ id: 'store-qa', ownerId: 'synthetic-owner', name: 'Synthetic QA', country: 'MY', subscriptionPlan: 'professional', subscriptionStatus: 'active' });
    const dates = Array.from({ length: 5 }, (_, i) => new Date(Date.now() + (i + 1) * 86400000).toISOString().slice(0, 10));
    const base = {
      storeId: 'store-qa', workspaceId: 'store-qa', currency: 'MYR', customerName: 'Synthetic Customer',
      phone: '0123456789', fulfilmentStatus: 'New', fulfilmentMethod: 'delivery',
      createdAt: new Date().toISOString(), payment: { status: 'paid', amountMinor: 12300 },
      items: [{ productId: 'synthetic-lunch', productName: 'Synthetic Lunch', quantity: 5, lineTotal: 60, notes: 'No onions', selectedOptions: [] }],
      fulfilments: dates.map((date, i) => ({
        id: `day-${i}`, date, time: '16:00', method: 'delivery',
        destination: { formattedAddress: 'Synthetic QA Address', deliveryInstructions: 'Ring the bell' },
        allocations: [{ itemIndex: 0, quantity: 1 }]
      })),
      totals: { merchandiseSubtotal: 60, deliveryFee: 63, discountTotal: 0, currency: 'MYR' },
      total: 123
    };
    const days = dates.map(date => ({ date, customerDeliveryFee: 12.6 }));
    await db.doc('storeOrders/qa-pos').set({
      ...base, orderNumber: 'QA-POS-001', orderSource: 'pos', storeName: 'GG Grab&Go',
      notes: 'Internal QA note', posDeliveryPricing: { customerDeliveryFee: 63, days }
    });
    await db.doc('storeOrders/qa-online').set({
      ...base, orderNumber: 'QA-ONLINE-001', orderSource: 'online', storeName: 'Synthetic Kitchen',
      notes: 'Pack separately', deliveryPricingSnapshot: { days }
    });
  } finally {
    await deleteApp(app);
  }
}
