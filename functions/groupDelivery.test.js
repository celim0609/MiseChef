import assert from 'node:assert/strict';
import test from 'node:test';
import { GROUP_DELIVERY_PILOT as pilot, eligibility, activePortions, snapshotLunchSelections, validateDeliveryDate, requireGroupDeliveryBeta, groupDeliveryKey, getGroupDeliveryArea } from './groupDelivery.js';
import { createGroupDeliveryPlaces } from './groupDeliveryPlaces.js';

const product = { id: 'lunch', name: 'Lunch', price: 12, available: true, optionGroupIds: [] };
const config = { enabled: true, eligibleProducts: { lunch: 1, combo: 2 }, dates: { '2026-11-03': { closesAt: '2026-11-02T09:00:00.000Z' } } };
const store = { country: 'MY', orderDays: ['tuesday'], earliestPickupDays: 0, maximumAdvanceDays: 14 };
const now = new Date('2026-11-01T00:00:00Z');
test('user-confirmed Pakatan Jaya pin, 1000m radius, 10 portions and zero customer delivery charge', () => {
  assert.equal(pilot.centerSource, 'user_confirmed_google_maps_pin');
  assert.equal(pilot.centerAddress, '44, Laluan Pakatan Jaya 3, Pakatan Jaya, 31150 Ipoh, Perak');
  assert.deepEqual(pilot.center, { latitude: 4.6413277, longitude: 101.1445881 });
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
  assert.equal(validateDeliveryDate(store, config, '2026-11-03', now), '2026-11-02T09:00:00.000Z');
  assert.throws(() => validateDeliveryDate(store, config, '2026-11-03', new Date('2026-11-02T09:00:00.000Z')));
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

// Independent forward spherical-geodesic construction, rather than offsets copied
// from the distance implementation. Uses the same 6,371 km mean Earth convention.
const destinationAt = (metres, bearingDegrees) => {
  const lat = pilot.center.latitude * Math.PI / 180;
  const lon = pilot.center.longitude * Math.PI / 180;
  const bearing = bearingDegrees * Math.PI / 180;
  const arc = metres / 6371000;
  const nextLat = Math.asin(Math.sin(lat) * Math.cos(arc) + Math.cos(lat) * Math.sin(arc) * Math.cos(bearing));
  const nextLon = lon + Math.atan2(Math.sin(bearing) * Math.sin(arc) * Math.cos(lat), Math.cos(arc) - Math.sin(lat) * Math.sin(nextLat));
  return { latitude: nextLat * 180 / Math.PI, longitude: nextLon * 180 / Math.PI };
};
test('1 km straight-line boundary is inclusive in eight directions; rounding never admits outside pins', () => {
  for (const bearing of [0,45,90,135,180,225,270,315]) {
    for (const [metres, expected] of [[0,true],[999.9,true],[1000,true],[1000.01,false],[1000.1,false],[1500,false]]) {
      const result = eligibility(destinationAt(metres, bearing));
      assert.equal(result.eligible, expected, `${metres}m at bearing ${bearing}`);
      assert.equal(result.distanceMetres, Math.round(metres));
    }
  }
});
test('new north-side customer pin uses corrected center and does not change kitchen pickup', () => {
  assert.equal(eligibility({ latitude: 4.649421594453269, longitude: 101.1445881 }).eligible, true);
  assert.equal(Object.hasOwn(pilot, 'pickup'), false);
  assert.equal(Object.hasOwn(pilot, 'pickupLocationId'), false);
});


test('Callable null area uses Bercham while explicit unconfigured areas are rejected', () => {
  assert.equal(getGroupDeliveryArea(null), pilot);
  assert.equal(groupDeliveryKey('store', '2026-11-10', null), groupDeliveryKey('store', '2026-11-10'));
  for (const area of ['tambun', 'ulu-kinta', '']) {
    assert.throws(() => getGroupDeliveryArea(area), { code: 'invalid-argument' });
  }
});
