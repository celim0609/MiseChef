import test from 'node:test';
import { calculatePromotionPricing } from './storePromotionPricing.js';
import assert from 'node:assert/strict';
import { calculateDeliveryDayPricing, deliveryDistanceKm } from './storeDeliveryPricing.js';
const pickup = { latitude: '3', longitude: '101' };
const destination = { latitude: '3.01', longitude: '101' };
const policy = { enabled: true, distanceThresholdKm: 8, minimumSubtotalWithin: 60, minimumSubtotalBeyond: 120 };
const price = (changes = {}) => {
  const args = { config: { freeDelivery: policy }, providerFee: 8.4, items: [{ lineTotal: 60 }], pickup, destination, ...changes };
  return calculateDeliveryDayPricing({ ...args, promotionPricing: changes.promotionPricing || calculatePromotionPricing({ items: args.items }) });
};
test('exact distance and subtotal belong to within tier; beyond tier uses its own minimum', () => {
  const exact = deliveryDistanceKm(pickup, destination);
  assert.equal(price({ config: { freeDelivery: { ...policy, distanceThresholdKm: exact } } }).customerDeliveryFee, 0);
  assert.equal(price({ config: { freeDelivery: { ...policy, distanceThresholdKm: exact - 0.001 } } }).customerDeliveryFee, 8.4);
  assert.equal(price({ config: { freeDelivery: { ...policy, distanceThresholdKm: exact - 0.001 } }, items: [{ lineTotal: 120 }] }).customerDeliveryFee, 0);
  assert.equal(price({ items: [{ lineTotal: 59.99 }] }).customerDeliveryFee, 8.4);
  assert.equal(price({ promotionPricing: { discountedMerchandiseTotal: 10, promotionSnapshot: { lineAdjustments: [] } } }).customerDeliveryFee, 8.4);
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


test('RM60 discounted to RM50 does not qualify for RM60, using the subsidy subtotal basis', () => {
  const items = [{ productId: 'meal', productName: 'Meal', basePrice: 60, quantity: 1, lineTotal: 60 }];
  const promotionPricing = calculatePromotionPricing({ items, promotions: [{ id: 'discount', name: 'Discount', active: true, storeId: 's', workspaceId: 's', minimumOrderAmount: 0, type: 'fixed_amount', fixedAmountOff: 10, eligibleProductIds: ['meal'], startsAt: '2020-01-01T00:00:00Z' }] });
  assert.equal(promotionPricing.discountedMerchandiseTotal, 50);
  const result = price({ items, promotionPricing, config: { freeDelivery: policy, subsidy: { enabled: true, minimumMerchandiseSpend: 60, maximumCustomerDeliveryCharge: 2 } } });
  assert.equal(result.days[0].merchandiseSubtotal, 50);
  assert.equal(result.days[0].freeDeliveryApplied, false);
  assert.equal(result.customerDeliveryFee, 8.4);
});

test('discounted weekly total is allocated per day and cannot qualify all five days as a whole', () => {
  const items = [{ productId: 'plan', productName: 'Week', basePrice: 150, quantity: 1, lineTotal: 150 }];
  const promotionPricing = calculatePromotionPricing({ items, promotions: [{ id: 'discount', name: 'Discount', active: true, storeId: 's', workspaceId: 's', minimumOrderAmount: 0, type: 'fixed_amount', fixedAmountOff: 30, eligibleProductIds: ['plan'], startsAt: '2020-01-01T00:00:00Z' }] });
  assert.equal(promotionPricing.discountedMerchandiseTotal, 120);
  const fulfilments = Array.from({ length: 5 }, (_, index) => ({ date: `2026-10-${19 + index}`, allocations: [{ itemIndex: 0 }] }));
  const result = price({ items, promotionPricing, fulfilments });
  assert.deepEqual(result.days.map(day => day.merchandiseSubtotal), [24,24,24,24,24]);
  assert.deepEqual(result.days.map(day => day.freeDeliveryApplied), [false,false,false,false,false]);
  assert.equal(result.customerDeliveryFee, 42);
  assert.equal(price({ items, promotionPricing, fulfilments, config: { freeDelivery: { ...policy, minimumSubtotalWithin: 24 } } }).customerDeliveryFee, 0);
});

const buffer = { provider: 'lalamove', market: 'MY', fixedDeliveryBuffer: { enabled: true, amountMinor: 300, maximumExtraCostMinor: 500 } };

test('fixed buffer rounds in sen and records only the amount actually collected', () => {
  const args = { providerFee: 6.236, serviceType: 'MOTORCYCLE', config: buffer };
  const result = price(args);
  assert.equal(result.customerDeliveryFee, 9.24);
  assert.equal(result.days[0].collectedBufferMinor, 300);
  assert.equal(result.days[0].providerDeliveryFee, 6.236);
  assert.deepEqual(price(args), result);
  const capped = price({ ...args, config: { ...buffer, subsidy: { enabled: true, minimumMerchandiseSpend: 50, maximumCustomerDeliveryCharge: 7 } } });
  assert.equal(capped.customerDeliveryFee, 7);
  assert.equal(capped.days[0].collectedBufferMinor, 76);
  for (const changes of [
    { serviceType: 'CAR' },
    { config: { ...buffer, provider: 'grab' } },
    { config: { ...buffer, fixedDeliveryBuffer: { ...buffer.fixedDeliveryBuffer, enabled: false } } },
    { config: {} },
  ]) assert.equal(price({ ...args, ...changes }).customerDeliveryFee, 6.24);
  assert.equal(price({ ...args, providerFee: 0 }).customerDeliveryFee, 0);
});

test('weekly trips apply free delivery independently using discounted merchandise', () => {
  const fulfilments = Array.from({ length: 5 }, (_, index) => ({ date: `2026-10-${19 + index}`, allocations: [{ itemIndex: 0 }] }));
  const dayQuotes = fulfilments.map(({ date }) => ({ date, destination, quote: { fee: 6, serviceType: 'MOTORCYCLE' } }));
  const args = { serviceType: 'MOTORCYCLE', fulfilments, dayQuotes, config: { ...buffer, freeDelivery: { ...policy, minimumSubtotalWithin: 24.01 } },
    items: [{ lineTotal: 150 }], promotionPricing: { discountedMerchandiseTotal: 120.02, promotionSnapshot: { lineAdjustments: [{ finalLineTotal: 120.02 }] } } };
  const result = price(args);
  assert.deepEqual(result.days.map(day => day.customerDeliveryFee), [0, 0, 9, 9, 9]);
  assert.deepEqual(result.days.map(day => day.collectedBufferMinor), [0, 0, 300, 300, 300]);
  assert.equal(result.customerDeliveryFee, 27);
  assert.throws(() => price({ ...args, dayQuotes: dayQuotes.slice(1) }), /every delivery day/);
  assert.throws(() => price({ ...args, dayQuotes: dayQuotes.map(day => ({ ...day, quote: { ...day.quote, fee: NaN } })) }), /Invalid provider/);
});
