import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDeliveryDayPricing, deliveryDistanceKm } from './storeDeliveryPricing.js';
const pickup = { latitude: '3', longitude: '101' };
const destination = { latitude: '3.01', longitude: '101' };
const policy = { enabled: true, distanceThresholdKm: 8, minimumSubtotalWithin: 60, minimumSubtotalBeyond: 120 };
const price = changes => calculateDeliveryDayPricing({ config: { freeDelivery: policy }, providerFee: 8.4, items: [{ lineTotal: 60 }], pickup, destination, discountedMerchandiseTotal: 60, ...changes });
test('exact distance and subtotal belong to within tier; beyond tier uses its own minimum', () => {
  const exact = deliveryDistanceKm(pickup, destination);
  assert.equal(price({ config: { freeDelivery: { ...policy, distanceThresholdKm: exact } } }).customerDeliveryFee, 0);
  assert.equal(price({ config: { freeDelivery: { ...policy, distanceThresholdKm: exact - 0.001 } } }).customerDeliveryFee, 8.4);
  assert.equal(price({ config: { freeDelivery: { ...policy, distanceThresholdKm: exact - 0.001 } }, items: [{ lineTotal: 120 }] }).customerDeliveryFee, 0);
  assert.equal(price({ items: [{ lineTotal: 59.99 }] }).customerDeliveryFee, 8.4);
  assert.equal(price({ discountedMerchandiseTotal: 10 }).customerDeliveryFee, 0);
});
test('disabled/missing policy preserves base fee and original single-day subsidy', () => {
  for (const freeDelivery of [undefined, { ...policy, enabled: false }]) {
    assert.equal(price({ config: { freeDelivery } }).customerDeliveryFee, 8.4);
    assert.equal(price({ config: { freeDelivery, subsidy: { enabled: true, minimumMerchandiseSpend: 50, maximumCustomerDeliveryCharge: 2 } } }).customerDeliveryFee, 2);
  }
});
test('mixed service days qualify separately, aggregate quantities once, and sum final fees', () => {
  const fulfilments = [{ date: '2026-10-19', allocations: [{ itemIndex: 0 }, { itemIndex: 1 }] }, { date: '2026-10-20', allocations: [{ itemIndex: 2 }] }];
  const result = price({ items: [{ lineTotal: 40 }, { lineTotal: 20 }, { lineTotal: 59.99 }], fulfilments });
  assert.deepEqual(result.days.map(day => day.freeDeliveryApplied), [true, false]);
  assert.equal(result.customerDeliveryFee, 8.4);
  assert.equal(price({ config: { subsidy: { enabled: true, minimumMerchandiseSpend: 1, maximumCustomerDeliveryCharge: 2 } }, items: [{ lineTotal: 40 }, { lineTotal: 20 }, { lineTotal: 59.99 }], fulfilments }).customerDeliveryFee, 16.8);
});
test('weekly plan subtotal is split across five days with conserved cents, never counted five times', () => {
  const fulfilments = Array.from({ length: 5 }, (_, index) => ({ date: `2026-10-${19 + index}`, allocations: [{ itemIndex: 0, componentDay: index }] }));
  const result = price({ items: [{ lineTotal: 300.02 }], fulfilments, config: { freeDelivery: { ...policy, minimumSubtotalWithin: 60.01 } } });
  assert.deepEqual(result.days.map(day => day.merchandiseSubtotal), [60.01,60.01,60,60,60]);
  assert.deepEqual(result.days.map(day => day.freeDeliveryApplied), [true,true,false,false,false]);
  assert.equal(result.customerDeliveryFee, 25.2);
  assert.equal(price({ items: [{ lineTotal: 120 }], fulfilments }).customerDeliveryFee, 42);
});
test('enabled policy fails closed for invalid policy, coordinates or allocations', () => {
  assert.throws(() => price({ destination: { latitude: '', longitude: '1' } }), /coordinates/);
  assert.throws(() => price({ config: { freeDelivery: { ...policy, distanceThresholdKm: -1 } } }), /settings/);
  assert.throws(() => price({ fulfilments: [{ date: '2026-10-19', allocations: [] }] }), /no service day/);
});
