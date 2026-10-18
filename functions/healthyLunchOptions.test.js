import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPendingOrder, buildOrderItems, toPublicPaymentOrderSummary } from './storePaymentsCore.js';
import { getWeeklyDates, validEmbeddedMeal } from './storeWeeklyMealPlan.js';
import { publicOrderFulfilments } from './storeOrderFulfilments.js';
import { snapshotMealOptions, validMealOptionGroups, parseMealOptionPrice } from './healthyLunchOptions.js';
import { calculateDeliveryDayPricing } from './storeDeliveryPricing.js';
import { calculatePromotionPricing } from './storePromotionPricing.js';

const now = new Date('2026-07-26T04:00:00Z');
const monday = '2026-07-27';
const dates = getWeeklyDates(monday);
const store = { id: 's', workspaceId: 's', name: 'Kitchen', country: 'MY', currency: 'MYR', pickupEnabled: true,
  orderDays: ['monday','tuesday','wednesday','thursday','friday'], maximumAdvanceDays: 14,
  pickupOperatingHours: { start: '10:00', end: '18:00' }, pickupLocations: [{ id: 'counter', name: 'Counter', address: 'Kitchen' }],
  delivery: { fulfilment: { preOrder: { enabled: true, orderDays: ['monday','tuesday','wednesday','thursday','friday'], maximumAdvanceDays: 14, deliveryHours: { from: '09:00', to: '18:00' } } } } };
const group = { id: 'egg', name: 'Egg Choice', type: 'choose', required: true, selection: 'single', options: [
  { id: 'boiled', name: 'Hard Boiled Egg', priceAdjustmentMinor: 0 },
  { id: 'omega', name: 'Omega Onsen Egg', priceAdjustmentMinor: 120 },
  { id: 'kangori', name: 'Kangori Onsen Egg', priceAdjustmentMinor: 220 }
] };
const planFixture = (version = 3) => {
  const meals = Object.fromEntries(['mon','tue','wed','thu','fri'].map(day => [day, { name: `${day} bowl`, photoUrl: `${day}.jpg`, price: 12.9, calories: 520, ...(day === 'mon' ? { optionGroups: [structuredClone(group)] } : {}) }]));
  return { id: 'plan', name: 'Healthy Lunch', storeId: 's', workspaceId: 's', productType: 'weekly_meal_plan', weeklyMenuVersion: version, available: true, price: 60, optionGroupIds: [],
    ...(version === 3 ? { rotationStartMonday: monday, rotationWeeks: { week1: { meals } }, healthyLunchBlockedDates: [] } : { weeklyWeeks: { week1: { startMonday: monday, meals } } }) };
};
const choice = (optionId = 'omega', serviceDate = monday, optionGroupId = 'egg') => ({ optionGroupId, optionId, serviceDate });
const selection = (optionId = 'omega', quantity = 1) => ({ productId: 'plan', quantity, selectedOptions: [], selectedMealOptions: [choice(optionId)] });
const draftFixture = (selected = selection(), day = false) => ({ customerName: 'Guest', phone: '+60123456789', pickupDate: monday, pickupTime: '10:00', pickupLocationId: 'counter', selections: [day ? { ...selected, healthyLunchPlanId: 'plan', healthyLunchDate: monday } : selected],
  ...(!day ? { fulfilments: dates.map(date => ({ date, time: '10:00', itemIndexes: [0] })) } : {}) });
const orderFixture = (draft = draftFixture(), plan = planFixture(), overrides = {}) => buildPendingOrder({ id: 'order', orderNumber: 'MC-1', store, draft, products: [plan], optionGroups: [], now, paymentProvider: 'stripe', paymentProviderMode: 'single_merchant', ...overrides });

test('RM0, +RM1.20 and +RM2.20 preserve RM60 plan / RM12.90 day bases with quantity x1 and x2 in v2/v3', () => {
  for (const version of [2,3]) for (const [id, cents] of [['boiled',0], ['omega',120], ['kangori',220]]) for (const q of [1,2]) for (const day of [false,true]) {
    const order = orderFixture(draftFixture(selection(id, q), day), planFixture(version));
    const expected = ((day ? 1290 : 6000) + cents) * q;
    assert.equal(order.payment.amountMinor, expected);
    assert.equal(order.totals.merchandiseSubtotal, expected / 100);
    assert.equal(order.items[0].basePrice, day ? 12.9 : 60);
    const snapshot = day ? order.items[0].healthyLunchSnapshot : order.items[0].weeklyPlanSnapshot.meals[0];
    assert.equal(snapshot.optionSurchargeUnitMinor, cents);
    assert.equal(snapshot.selectedMealOptions[0].priceAdjustmentMinor, cents);
    assert.equal(snapshot.serviceDate, monday);
    assert.equal(order.items[0].mealOptionDays, undefined);
  }
});

test('independent Monday/Wednesday options add once per selected service day', () => {
  const plan = planFixture();
  plan.rotationWeeks.week1.meals.wed.optionGroups = [{ ...structuredClone(group), id: 'side', name: 'Side', type: 'add_side' }];
  const selected = { ...selection('omega',2), selectedMealOptions: [choice('omega'), choice('kangori', dates[2], 'side')] };
  const order = orderFixture(draftFixture(selected), plan);
  assert.equal(order.payment.amountMinor, 12680);
  assert.deepEqual(order.items[0].weeklyPlanSnapshot.meals.map(meal => meal.optionSurchargeUnitMinor || 0), [120,0,220,0,0]);
  const day = orderFixture(draftFixture(selection('omega',2), true), plan);
  assert.equal(day.payment.amountMinor, 2820);
  assert.equal(toPublicPaymentOrderSummary(day).items[0].selectedMealOptions[0].optionName,'Omega Onsen Egg');
});

test('server rejects missing required, duplicate, unknown, cross-day, inactive/deleted selections and option quantities', () => {
  for (const choices of [[], [choice(),choice()], [choice('missing')], [choice('omega',dates[1])], [choice('omega',monday,'missing')], [{ ...choice(), quantity: 2 }]]) {
    assert.throws(() => orderFixture(draftFixture({ ...selection(), selectedMealOptions: choices })));
  }
  for (const change of ['disable','delete']) {
    const plan = planFixture(); const options = plan.rotationWeeks.week1.meals.mon.optionGroups[0].options;
    if (change === 'disable') options[1].active = false; else options.splice(1,1);
    assert.throws(() => orderFixture(draftFixture(), plan), /available/);
  }
  assert.throws(() => orderFixture(draftFixture({ ...selection(), selectedMealOptions: {} })), /Invalid/);
});

test('all four cardinality rules are enforced without option quantities/min/max rules', () => {
  for (const required of [true,false]) for (const selection of ['single','multi']) {
    const meal = { optionGroups: [{ ...group, required, selection }] };
    if (required) assert.throws(() => snapshotMealOptions(meal,monday,[]), /Complete/);
    else assert.equal(snapshotMealOptions(meal,monday,[]).optionSurchargeUnitMinor,0);
    assert.equal(snapshotMealOptions(meal,monday,[choice('boiled')]).optionSurchargeUnitMinor,0);
    if (selection === 'single') assert.throws(() => snapshotMealOptions(meal,monday,[choice(),choice('kangori')]), /Complete/);
    else assert.equal(snapshotMealOptions(meal,monday,[choice(),choice('kangori')]).optionSurchargeUnitMinor,340);
  }
});

test('purchased option snapshots ignore forged client prices and survive merchant rename, repricing, disabling and removal', () => {
  const plan = planFixture();
  const order = orderFixture(draftFixture({ ...selection(), selectedMealOptions: [{ ...choice(), priceAdjustmentMinor: 0, optionName: 'Forged', optionGroupName: 'Forged' }] }),plan);
  const expected = { optionGroupId: 'egg', optionGroupName: 'Egg Choice', optionGroupType: 'choose', optionId: 'omega', optionName: 'Omega Onsen Egg', priceAdjustmentMinor: 120, serviceDate: monday };
  assert.deepEqual(order.items[0].weeklyPlanSnapshot.meals[0].selectedMealOptions,[expected]);
  const before = JSON.stringify(order);
  const mutableGroup = plan.rotationWeeks.week1.meals.mon.optionGroups[0];
  mutableGroup.name = 'New name'; mutableGroup.options[1].name = 'New egg'; mutableGroup.options[1].priceAdjustmentMinor = 999; mutableGroup.options[1].active = false;
  mutableGroup.options.splice(1,1); plan.rotationWeeks.week1.meals.mon.optionGroups = [];
  assert.equal(JSON.stringify(order),before);
  const projection = publicOrderFulfilments(order);
  assert.deepEqual(projection[0].meals[0].selectedMealOptions,[expected]);
  assert.equal(projection[1].meals[0].selectedMealOptions,undefined);
});

test('old menus produce unchanged snapshots and prices with absent or empty option groups', () => {
  for (const version of [2,3]) {
    const plan = planFixture(version); const meals = version === 3 ? plan.rotationWeeks.week1.meals : plan.weeklyWeeks.week1.meals;
    delete meals.mon.optionGroups;
    const plain = orderFixture(draftFixture({ productId: 'plan', quantity: 2, selectedOptions: [] }),plan);
    meals.mon.optionGroups = [];
    const empty = orderFixture(draftFixture({ productId: 'plan', quantity: 2, selectedOptions: [] }),plan);
    assert.deepEqual(empty,plain); assert.equal(plain.payment.amountMinor,12000);
    assert.equal(plain.items[0].weeklyPlanSnapshot.meals[0].selectedMealOptions,undefined);
  }
});

test('delivery assigns surcharge to Monday only and allocates base-only promotions exactly', () => {
  const plan = planFixture();
  const items = buildOrderItems([selection('kangori',2)],[plan],[],[],monday);
  const fulfilments = dates.map(date => ({ date, allocations: [{ itemIndex: 0, quantity: 2 }] }));
  const config = { freeDelivery: { enabled: true, distanceThresholdKm: 100, minimumSubtotalWithin: 27, minimumSubtotalBeyond: 100 } };
  const point = { latitude: 3, longitude: 101 };
  const pricing = promotions => calculateDeliveryDayPricing({ config, providerFee: 7, items, fulfilments, pickup: point, destination: point, promotionPricing: calculatePromotionPricing({ items,promotions,now }) });
  const result = pricing([]);
  assert.deepEqual(result.days.map(day => day.merchandiseSubtotal),[28.4,24,24,24,24]);
  assert.deepEqual(result.days.map(day => day.freeDeliveryApplied),[true,false,false,false,false]);
  assert.equal(result.customerDeliveryFee,28);
  // Existing promotion pricing discounts basePrice; surcharges remain excluded from the base.
  const promotion = { id: 'promo', storeId: 's', workspaceId: 's', name: '10%', active: true, type: 'percentage', eligibleProductIds: ['plan'], percentageOff: 10, minimumQuantity: 0, minimumOrderAmount: 0, startsAt: new Date('2026-07-01T00:00:00Z'), endsAt: null, priority: 0 };
  const promoted = pricing([promotion]);
  const promotionPricing = calculatePromotionPricing({ items,promotions: [promotion],now });
  assert.equal(promotionPricing.discountTotal,12);
  assert.equal(promotionPricing.discountedMerchandiseTotal,112.4);
  assert.equal(promoted.days.reduce((sum,day) => sum + Math.round(day.merchandiseSubtotal*100),0),Math.round(promotionPricing.discountedMerchandiseTotal*100));
  assert.deepEqual(promoted.days.map(day => day.merchandiseSubtotal),[26,21.6,21.6,21.6,21.6]);
});

test('schema rejects invalid cents and unsupported group fields; decimal editor input parses exact cents', () => {
  for (const price of [-1,1.2,NaN,Infinity,Number.MAX_SAFE_INTEGER,'120']) assert.equal(validMealOptionGroups([{ ...group, options: [{ ...group.options[0], priceAdjustmentMinor: price }] }]),false);
  assert.equal(validMealOptionGroups([{ ...group, minimumSelections: 1 }]),false);
  assert.equal(validMealOptionGroups([{ ...group, required:false, options:[] }]),true);
  assert.equal(validMealOptionGroups([{ ...group, options: group.options.map(option => ({ ...option,active:false })) }]),false);
  assert.equal(validEmbeddedMeal({ name:'Meal',photoUrl:'a.jpg',price:12.9,optionGroups:[group] }),true);
  assert.deepEqual(['0','1.20','2.20'].map(parseMealOptionPrice),[0,120,220]);
  for (const value of ['-1','1.201','','NaN']) assert.ok(Number.isNaN(parseMealOptionPrice(value)));
});
