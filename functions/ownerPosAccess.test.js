import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInput, assertOperator } from './externalPosOrders.js';
import { buildExternalOrderItems } from './externalPosOrderModel.js';
import { buildOrderItems } from './storePaymentsCore.js';

const store = { id: 'store-1', workspaceId: 'workspace-1', currency: 'MYR', pickupLocations: [{ id: 'loc', name: 'Kitchen', address: 'Here' }], orderDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'], earliestPickupDays: 0, maximumAdvanceDays: 30, unavailableDates: [], pickupOperatingHours: { start: '09:00', end: '18:00' } };
const product = { id: 'draft', storeId: 'store-1', workspaceId: 'workspace-1', name: 'Draft dish', available: false, price: 9, optionGroupIds: [] };
const checkout = { store, products: [product], optionGroups: [], sets: [] };
const input = quantity => ({ source: 'walk_in', paymentLabel: 'walk_in_paid', requestId: 'a'.repeat(16), selections: [{ productId: 'draft', quantity, selectedOptions: [] }] });

for (const quantity of [1, 20, 21, 40, 100, 200]) {
  test(`Owner POS accepts quantity ${quantity} at canonical price`, () => {
    const built = buildExternalOrderItems(input(quantity), checkout, new Date('2026-10-18T04:00:00Z'), { owner: true });
    assert.equal(built.items[0].lineTotal, 9 * quantity);
    assert.equal(built.items[0].quantity, quantity);
    assert.doesNotThrow(() => validateInput(input(quantity), true));
    if (quantity > 20) assert.throws(() => validateInput(input(quantity)), /quantity/i);
  });
}
test('public Store cannot select unpublished product or exceed 20', () => {
  assert.throws(() => buildOrderItems(input(1).selections, checkout.products, [], [], undefined, { storeId: 'store-1' }), /no longer available/i);
  assert.throws(() => buildExternalOrderItems(input(21), checkout), /quantity/i);
});
test('Owner POS rejects cross-store catalog, invalid configuration and unsafe quantities', () => {
  const foreign = { ...product, storeId: 'store-2' };
  assert.throws(() => buildExternalOrderItems(input(1), { ...checkout, products: [foreign] }, undefined, { owner: true }), /another Store/i);
  assert.throws(() => buildExternalOrderItems(input(1), { ...checkout, products: [{ ...product, price: NaN }] }, undefined, { owner: true }), /configuration/i);
  for (const quantity of [0, -1, 1.5, 10001, Number.MAX_SAFE_INTEGER]) assert.throws(() => validateInput(input(quantity), true), /quantity/i);
});
test('backend Owner role is derived from active workspace records', async () => {
  const records = new Map([
    ['workspaces/workspace-1', { ownerId: 'owner', subscriptionPlan: 'business', subscriptionStatus: 'active' }],
    ['workspaceMembers/workspace-1_staff', { userId: 'staff', workspaceId: 'workspace-1', role: 'Chef', status: 'Active' }]
  ]);
  const db = { collection: name => ({ doc: id => ({ get: async () => ({ data: () => records.get(`${name}/${id}`) || {} }) }) }) };
  // The owner decision must never come from the request body.
  assert.equal(await assertOperator({ db, uid: 'owner', workspaceId: 'workspace-1' }), true);
  assert.equal(await assertOperator({ db, uid: 'staff', workspaceId: 'workspace-1' }), false);
  await assert.rejects(() => assertOperator({ db, uid: 'outsider', workspaceId: 'workspace-1' }), /role/i);
});

test('Owner scheduled quantity 200 retains one canonical line and one fulfilment allocation', () => {
  const built = buildExternalOrderItems({ ...input(200), lineSchedules: [{ date: '2026-10-20', time: '12:00' }], fulfilmentMethod: 'pickup' }, checkout, new Date('2026-10-18T04:00:00Z'), { owner: true });
  assert.equal(built.items[0].lineTotal, 1800);
  assert.equal(built.fulfilments[0].allocations[0].quantity, 200);
});
