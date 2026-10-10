import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOrderFulfilments, canonicalSchedule, publicOrderFulfilments } from './storeOrderFulfilments.js';
import { buildPendingOrder, getValidPickupDates, getPickupTimeSlots } from './storePaymentsCore.js';

const now = new Date('2026-07-26T04:00:00Z');
const store = { id: 's', workspaceId: 's', name: 'Kitchen', country: 'MY', currency: 'MYR', pickupEnabled: true,
  orderDays: ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'], maximumAdvanceDays: 14,
  pickupOperatingHours: { start: '10:00', end: '18:00' }, pickupLocations: [{ id: 'counter', name: 'Counter', address: 'Kitchen' }],
  delivery: { fulfilment: { preOrder: { enabled: true, orderDays: ['monday','tuesday','wednesday','thursday','friday'], maximumAdvanceDays: 14, deliveryHours: { from: '09:00', to: '18:00' } } } } };
const products = ['mon','tue','wed','thu','fri'].map(day => ({ id: day, name: `${day} meal`, storeId: 's', workspaceId: 's', price: 10, available: true, availableDay: day, optionGroupIds: [] }));
const schedule = [{ date: '2026-07-27', time: '10:00', itemIndexes: [0] }, { date: '2026-07-31', time: '11:00', itemIndexes: [1] }];
const draft = { customerName: 'Guest', phone: '+60123456789', pickupDate: '2026-07-27', pickupTime: '10:00', pickupLocationId: 'counter', selections: [{ productId: 'mon', quantity: 2 }, { productId: 'fri', quantity: 3 }], fulfilments: schedule };
const build = changes => buildOrderFulfilments({ store, draft, products, now, getDates: getValidPickupDates, getTimes: getPickupTimeSlots, ...changes });
const financial = changes => buildPendingOrder({ id: 'order', orderNumber: 'MC-1', store, draft, products, optionGroups: [], now, paymentProvider: 'stripe', paymentProviderMode: 'single_merchant', ...changes });

test('Monday and Friday remain one financial order with exactly two immutable allocations', () => {
  const order = financial();
  assert.equal(order.total, 50); assert.equal(order.items.length, 2); assert.equal(order.itemCount, 5);
  assert.equal(order.payment.amountMinor, 5000); assert.equal(order.fulfilments.length, 2);
  assert.equal(order.fulfilments[0].date, schedule[0].date); assert.equal(order.fulfilments[1].time, '11:00');
  assert.deepEqual(order.fulfilments.map(day => day.allocations[0].quantity), [2,3]);
  assert.deepEqual(draft.fulfilments, schedule);
});

test('server rejects wrong weekday, omitted/duplicate/unknown allocations, duplicate dates and invalid slots', () => {
  const invalid = [
    [{ ...schedule[0], date: '2026-07-28' }, schedule[1]], [schedule[0]],
    [schedule[0], { ...schedule[1], itemIndexes: [0,1] }],
    [schedule[0], { ...schedule[1], itemIndexes: [2] }],
    [schedule[0], { ...schedule[1], date: schedule[0].date }],
    [{ ...schedule[0], time: '07:00' }, schedule[1]],
    [{ ...schedule[0], date: '2026-02-30' }, schedule[1]],
    [{ ...schedule[0], itemIndexes: [0,0] }, schedule[1]]
  ];
  for (const fulfilments of invalid) assert.throws(() => financial({ draft: { ...draft, fulfilments } }));
  assert.throws(() => build({ store: { ...store, unavailableDates: ['2026-07-31'] } }), /available/);
  assert.throws(() => build({ groupOrder: { id: 'group' } }), /Group/);
  assert.throws(() => financial({ draft: { ...draft, deliverySnapshot: { quote: { fee: 0 } } } }), /Pickup fulfilments/);
  assert.throws(() => build({ draft: { ...draft, pickupLocationId: 'foreign' } }), /location/);
});

test('delivery counts scheduled days, never meals or quantities, and ignores client fees/counts', () => {
  const deliveryDraft = { ...draft, fulfilmentMethod: 'delivery', fulfilmentMode: 'preorder', deliverySnapshot: { quote: { fee: 7.25, quotationId: 'first' }, schedule: { date: schedule[0].date }, fulfilmentMode: 'preorder' }, fulfilmentCount: 99, deliveryFee: 0 };
  const order = financial({ draft: deliveryDraft });
  assert.equal(order.totals.deliveryFee, 14.5); assert.equal(order.total, 64.5);
  assert.equal(order.deliveryPricingSnapshot.firstDayFee, 7.25);
  assert.equal(order.deliveryPricingSnapshot.fulfilmentCount, 2);
  assert.equal(order.deliveryPricingSnapshot.finalDeliveryTotal, 14.5);
  assert.equal(order.payment.amountMinor, 6450);
  const subsidisedStore = { ...store, delivery: { ...store.delivery, subsidy: { enabled: true, minimumMerchandiseSpend: 1, maximumCustomerDeliveryCharge: 2 } } };
  const fixedRule = financial({ store: subsidisedStore, draft: deliveryDraft });
  assert.equal(fixedRule.totals.deliveryFee, 14.5);
  assert.equal(fixedRule.delivery.pricing.subsidyApplied, false);
  assert.throws(() => financial({ draft: { ...deliveryDraft, fulfilmentMode: 'instant' } }), /pre-order/);
});

test('three fulfilments multiply first quote by three even when quantities differ', () => {
  const selections = [{ productId: 'mon', quantity: 20 }, { productId: 'wed', quantity: 1 }, { productId: 'fri', quantity: 4 }];
  const fulfilments = [schedule[0], { date: '2026-07-29', time: '12:00', itemIndexes: [1] }, { ...schedule[1], itemIndexes: [2] }];
  const order = financial({ draft: { ...draft, selections, fulfilments, fulfilmentMethod: 'delivery', fulfilmentMode: 'preorder', deliverySnapshot: { quote: { fee: 8 }, schedule: { date: schedule[0].date } } } });
  assert.equal(order.totals.deliveryFee, 24); assert.equal(order.deliveryPricingSnapshot.fulfilmentCount, 3);
});

test('Weekly Plan references one paid line five times with five immutable meal components', () => {
  const days = ['mon','tue','wed','thu','fri'];
  const plan = { id: 'plan', name: 'Week', price: 45, available: true, storeId: 's', workspaceId: 's', productType: 'weekly_meal_plan', optionGroupIds: [], weeklyMeals: Object.fromEntries(days.map(day => [day,day])) };
  const fulfilments = days.map((day, index) => ({ date: `2026-07-${27 + index}`, time: `${10 + index}:00`, itemIndexes: [0] }));
  const order = financial({ products: [...products, plan], draft: { ...draft, selections: [{ productId: 'plan', quantity: 2 }], fulfilments, fulfilmentMethod: 'delivery', fulfilmentMode: 'preorder', deliverySnapshot: { quote: { fee: 6 }, schedule: { date: '2026-07-27' } } } });
  assert.equal(order.items.length, 1); assert.equal(order.totals.merchandiseSubtotal, 90);
  assert.equal(order.totals.deliveryFee, 30); assert.equal(order.deliveryPricingSnapshot.fulfilmentCount, 5);
  assert.deepEqual(order.items[0].weeklyPlanSnapshot.meals.map(meal => meal.productName), days.map(day => `${day} meal`));
  assert.deepEqual(order.fulfilments.map(day => day.allocations[0].quantity), [2,2,2,2,2]);
  assert.equal(order.weeklyFulfilments, undefined);
  assert.equal(publicOrderFulfilments(order)[4].meals[0].productName, 'fri meal');
});

test('legacy drafts do not gain a fulfilment schema; missing Available Day remains all', () => {
  assert.equal(canonicalSchedule({}), null);
  assert.equal(build({ draft: { ...draft, fulfilments: undefined } }), null);
  assert.doesNotThrow(() => build({ products: products.map(product => ({ ...product, availableDay: undefined })), draft: { ...draft, fulfilments: [{ ...schedule[0], date: '2026-07-28' }, schedule[1]] } }));
  const order = financial({ draft: { ...draft, fulfilments: undefined, selections: [draft.selections[0]] } });
  assert.equal(order.fulfilments, undefined); assert.equal(order.total, 20);
});

test('customer projection includes meals/schedules but omits IDs, costs and operators', () => {
  const order = financial(); order.fulfilmentCompletion = { [order.fulfilments[0].id]: { completedBy: 'private', completedAt: 'now' } };
  const projection = publicOrderFulfilments(order);
  assert.equal(projection[0].completed, true); assert.equal(projection[1].completed, false);
  assert.equal(JSON.stringify(projection).includes('private'), false);
  assert.equal(JSON.stringify(projection).includes('itemIndex'), false);
});
