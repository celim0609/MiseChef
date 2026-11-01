import assert from 'node:assert/strict';
import test from 'node:test';
import { GROUP_DELIVERY_PILOT as pilot, eligibility, activePortions, snapshotLunchSelections, validateDeliveryDate, requireGroupDeliveryBeta, groupDeliveryKey } from './groupDelivery.js';
import { createGroupDeliveryPlaces } from './groupDeliveryPlaces.js';

const product = { id: 'lunch', name: 'Lunch', price: 12, available: true, optionGroupIds: [] };
const config = { enabled: true, eligibleProducts: { lunch: 1, combo: 2 }, dates: { '2026-11-03': { closesAt: '2026-11-03T02:00:00Z' } } };
const store = { country: 'MY', orderDays: ['tuesday'], earliestPickupDays: 0, maximumAdvanceDays: 14 };
const now = new Date('2026-11-01T00:00:00Z');
test('exact Google address pin, 1000m radius, 10 portions and zero customer delivery charge', () => {
  assert.equal(pilot.centerPlaceId, 'ChIJcesW6EztyjERi2lHR-4JneY');
  assert.deepEqual(pilot.center, { latitude: 4.6376547, longitude: 101.1467695 });
  assert.equal(pilot.customerDeliveryFeeMinor, 0); assert.equal(pilot.minimumPortions, 10);
  assert.equal(eligibility(pilot.center).eligible, true);
  const latitudeOffset = metres => metres / 6371000 * 180 / Math.PI;
  assert.equal(eligibility({ ...pilot.center, latitude: pilot.center.latitude + latitudeOffset(999.9) }).eligible, true);
  assert.equal(eligibility({ ...pilot.center, latitude: pilot.center.latitude + latitudeOffset(1000.1) }).eligible, false);
  assert.throws(() => eligibility({ latitude: '', longitude: '' }));
});
test('counts meal quantities, excludes unlisted drinks/add-ons, handles combo units', () => {
  assert.equal(snapshotLunchSelections([{ productId: 'lunch', quantity: 3 }, { productId: 'combo', quantity: 2 }], [product, { ...product, id: 'combo' }], config, '2026-11-03').portions, 7);
  for (const selections of [[{ productId: 'drink', quantity: 10 }], [{ productId: 'lunch', quantity: 1.5 }], [{ productId: 'lunch', quantity: -1 }], [{ productId: 'lunch', quantity: 1 }, { productId: 'lunch', quantity: 1 }]]) assert.throws(() => snapshotLunchSelections(selections, [product], config, '2026-11-03'));
  assert.throws(() => snapshotLunchSelections([{ productId: 'lunch', quantity: 2 }], [{ ...product, available: false }], config, '2026-11-03'));
  assert.throws(() => snapshotLunchSelections([{ productId: 'lunch', quantity: 2 }], [{ ...product, availableDay: 'mon' }], config, '2026-11-03'));
});
test('embedded lunch counts one date, options add price but never portions; blocked dates excluded', () => {
  const meal = { name: 'Tuesday lunch', price: 10, photoUrl: 'https://example.test/lunch.jpg', optionGroups: [{ id: 'side', name: 'Side', type: 'add_side', required: true, selection: 'single', options: [{ id: 'egg', name: 'Egg', priceAdjustmentMinor: 200 }] }] };
  const plan = { ...product, productType: 'weekly_meal_plan', weeklyMenuVersion: 3, rotationStartMonday: '2026-11-02', rotationWeeks: { week1: { meals: { tue: meal } } } };
  const selection = { productId: 'lunch', quantity: 3, selectedMealOptions: [{ serviceDate: '2026-11-03', optionGroupId: 'side', optionId: 'egg' }] };
  const result = snapshotLunchSelections([selection], [plan], config, '2026-11-03');
  assert.equal(result.portions, 3); assert.equal(result.items[0].indicativeUnitPriceMinor, 1200);
  assert.throws(() => snapshotLunchSelections([{ ...selection, selectedMealOptions: [] }], [plan], config, '2026-11-03'));
  assert.throws(() => snapshotLunchSelections([selection], [{ ...plan, healthyLunchBlockedDates: ['2026-11-03'] }], config, '2026-11-03'));
});
test('expired at exact deadline and cancelled reservations never count', () => {
  const r = { portions: 5, status: 'reserved', expiresAt: now.toISOString() };
  assert.equal(activePortions([r, { ...r, status: 'cancelled', expiresAt: '2027-01-01' }, { ...r, expiresAt: '2027-01-01', portions: 4 }], now), 4);
});
test('date and store availability are authoritative; never accepts Production', () => {
  assert.equal(validateDeliveryDate(store, config, '2026-11-03', now), '2026-11-03T02:00:00Z');
  assert.throws(() => validateDeliveryDate(store, config, '2026-11-03', new Date('2026-11-03T02:00:00Z')));
  assert.throws(() => validateDeliveryDate(store, { ...config, enabled: false }, '2026-11-03', now));
  assert.throws(() => validateDeliveryDate(store, config, '2026-11-31', now));
  assert.throws(() => requireGroupDeliveryBeta('misechef-fa4bf'));
  assert.doesNotThrow(() => requireGroupDeliveryBeta('misechef-beta-fa4bf'));
  assert.notEqual(groupDeliveryKey('a','2026-11-03'), groupDeliveryKey('b','2026-11-03'));
});
test('Places server uses OAuth, projects fields, and rejects foreign address or mismatched place', async () => {
  const calls = [];
  const places = createGroupDeliveryPlaces({ accessToken: async () => 'test-token', fetchImpl: async (url, init) => { calls.push({url,init}); return { ok: true, json: async () => ({ id: 'place', formattedAddress: 'Address', location: { latitude: 4, longitude: 101 }, addressComponents: [{ types: ['country'], shortText: 'MY' }] }) }; } });
  assert.deepEqual(await places.resolve('place'), { formattedAddress: 'Address', latitude: 4, longitude: 101 });
  assert.equal(calls[0].init.headers.Authorization, 'Bearer test-token');
  assert.equal(calls[0].init.headers['X-Goog-User-Project'], 'misechef-beta-fa4bf');
  await assert.rejects(places.resolve('other'));
});
