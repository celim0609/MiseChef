import test from 'node:test';
import assert from 'node:assert/strict';
import { weeklyPricing, validateWeeklyStructure, WEEKLY_DAYS } from './storeWeeklyMealPlan.js';
import { buildPendingOrder, toPublicPaymentOrderSummary } from './storePaymentsCore.js';
const menu = () => Object.fromEntries(WEEKLY_DAYS.map((day, i) => [day, { name: day, photoUrl: 'meal.jpg', price: 10 + i }]));
const plan = discount => ({ id: 'plan', storeId: 's', workspaceId: 's', name: 'Lunch', photoUrl: '', productType: 'weekly_meal_plan', weeklyMenuVersion: 3,
  available: true, optionGroupIds: [], price: 55, rotationStartMonday: '2026-07-27', healthyLunchBlockedDates: [],
  rotationWeeks: { week1: { meals: menu(), ...(discount ? { discount } : {}) }, week2: { meals: menu(), discount: { type: 'fixed_weekly_price', value: 40 } } } });
const store = { id: 's', workspaceId: 's', name: 'Kitchen', country: 'MY', currency: 'MYR', pickupEnabled: true,
  orderDays: ['monday','tuesday','wednesday','thursday','friday'], maximumAdvanceDays: 21, earliestPickupDays: 0,
  pickupOperatingHours: { start: '10:00', end: '18:00' }, pickupLocations: [{ id: 'counter', name: 'Counter', address: 'Kitchen' }] };
const promotion = { id: 'promo', storeId: 's', workspaceId: 's', name: 'Promo', active: true, type: 'fixed_amount', eligibleProductIds: ['plan'], fixedAmountOff: 2, minimumOrderAmount: 0, startsAt: '2020-01-01T00:00:00Z' };
const order = (product, overrides = {}) => buildPendingOrder({ id: 'o', orderNumber: 'MC-260726-TEST', store, products: [product], optionGroups: [],
 paymentProvider: 'stripe', paymentProviderMode: 'test', now: new Date('2026-07-26T04:00:00Z'),
 draft: { customerName: 'Guest', phone: '+60123456789', pickupDate: '2026-07-27', pickupTime: '10:00', pickupLocationId: 'counter',
 selections: [{ productId: 'plan', quantity: 2 }], fulfilments: WEEKLY_DAYS.map((_, i) => ({ date: `2026-07-${27+i}`, time: '10:00', itemIndexes: [0] })) }, ...overrides });
for (const [type, value, expected] of [['none',0,60], ['percentage',12.5,52.5], ['fixed_amount',7.35,52.65], ['fixed_weekly_price',45,45]]) {
 test(`${type}: independent weeks, authoritative checkout quantity and immutable snapshot`, () => {
  const product = plan({ type, value });
  assert.equal(validateWeeklyStructure(product), '');
  assert.equal(weeklyPricing(product, [], '2026-07-27').originalPrice, 60);
  assert.equal(weeklyPricing(product, [], '2026-07-27').finalWeeklyPrice, expected);
  assert.equal(weeklyPricing(product, [], '2026-08-03').finalWeeklyPrice, 40);
  const saved = order(product);
  assert.equal(saved.total, expected * 2); assert.equal(saved.payment.amountMinor, Math.round(expected * 200));
  assert.equal(saved.items[0].weeklyPriceSnapshot.discountAmount, Math.round((60 - expected) * 100) / 100);
  const snapshot = JSON.stringify(saved);
  product.rotationWeeks.week1.discount.value = 99; product.rotationWeeks.week1.meals.mon.price = 999;
  assert.equal(JSON.stringify(saved), snapshot);
  assert.deepEqual(toPublicPaymentOrderSummary(saved).items[0].weeklyPriceSnapshot, saved.items[0].weeklyPriceSnapshot);
 });
}
test('invalid weekly discounts reject at validation and checkout; zero and full discount boundaries', () => {
 for (const discount of [{type:'percentage',value:101},{type:'percentage',value:-1},{type:'fixed_amount',value:60.01},{type:'fixed_weekly_price',value:61},{type:'none',value:1},{type:'bogus',value:0},{type:'fixed_amount',value:NaN},{type:'fixed_amount',value:0.001}]) {
  const product = plan(discount); assert.ok(validateWeeklyStructure(product)); assert.throws(() => order(product), /discount/);
 }
 assert.equal(weeklyPricing(plan({type:'percentage',value:100}), [], '2026-07-27').finalWeeklyPrice, 0);
 assert.throws(() => order(plan({type:'percentage',value:100})), /greater than zero/);
});
test('discount never affects Order by Day and explicit weekly discounts cannot stack', () => {
 const product = plan({type:'percentage',value:10});
 assert.equal(order(product, {promotions:[promotion]}).total, 108);
 const daily = order(product, {promotions:[promotion], draft:{ customerName:'Guest',phone:'+60123456789',pickupLocationId:'counter',pickupDate:'2026-07-28',pickupTime:'10:00',selections:[{productId:'plan',quantity:2,healthyLunchPlanId:'plan',healthyLunchDate:'2026-07-28'}],fulfilments:[{date:'2026-07-28',time:'10:00',itemIndexes:[0]}] }});
 // A separate explicit daily promotion still applies, while the weekly 10% does not.
 assert.equal(daily.items[0].basePrice,11); assert.equal(daily.total,18); assert.equal(daily.items[0].weeklyPriceSnapshot,undefined);
});
test('legacy Week 1/2 prices and existing promotion behavior remain unchanged', () => {
 const product = plan(); delete product.rotationWeeks.week2.discount;
 assert.equal(weeklyPricing(product, [], '2026-07-27').finalWeeklyPrice,55);
 assert.equal(weeklyPricing(product, [], '2026-08-03').finalWeeklyPrice,55);
 assert.equal(order(product, {promotions:[promotion]}).total,106);
});
test('server uses the scheduled Monday even when client sends a cheaper week', () => {
 const product = plan({type:'none',value:0});
 const result = order(product, {draft: {customerName:'Guest',phone:'+60123456789',pickupLocationId:'counter',pickupDate:'2026-07-27',pickupTime:'10:00',selections:[{productId:'plan',quantity:1,healthyLunchWeekMonday:'2026-08-03',price:0}],fulfilments:WEEKLY_DAYS.map((_,i)=>({date:`2026-07-${27+i}`,time:'10:00',itemIndexes:[0]}))}});
 assert.equal(result.total,60); assert.equal(result.items[0].weeklyPriceSnapshot.finalWeeklyPrice,60);
});
test('weekly percentage discounts exclude meal option surcharges', () => {
 const product = plan({type:'percentage',value:10});
 product.rotationWeeks.week1.meals.mon.optionGroups = [{id:'side',name:'Side',type:'add_side',required:false,selection:'single',options:[{id:'egg',name:'Egg',priceAdjustmentMinor:125}]}];
 const result = order(product, {draft: {customerName:'Guest',phone:'+60123456789',pickupLocationId:'counter',pickupDate:'2026-07-27',pickupTime:'10:00',selections:[{productId:'plan',quantity:2,selectedMealOptions:[{optionGroupId:'side',optionId:'egg',serviceDate:'2026-07-27'}]}],fulfilments:WEEKLY_DAYS.map((_,i)=>({date:`2026-07-${27+i}`,time:'10:00',itemIndexes:[0]}))}});
 assert.equal(result.total,110.5); assert.equal(result.items[0].basePrice,54); assert.equal(result.items[0].unitPrice,55.25);
});
