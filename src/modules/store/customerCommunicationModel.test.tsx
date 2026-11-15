import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import WhatsAppCustomerActions from './WhatsAppCustomerActions';
import { customerActionMessage, customerActionUrl, plainText } from './customerCommunicationModel';
import type { StoreOrder } from './types';
const order = (extra: Partial<StoreOrder> = {}) => ({
  id: 'order', customerName: 'Aina &amp; Ali', phone: '0123456789', orderNumber: 'MC-1', storeName: 'Shop',
  pickupDate: '2026-10-29', pickupTime: '12:30', pickupLocationAddress: 'Counter A', fulfilmentStatus: 'Preparing',
  items: [{ productName: 'Rice', quantity: 2 }, { productName: 'Soup', quantity: 1 }],
  payment: { status: 'pending' }, ...extra
} as StoreOrder);
const message = (o: StoreOrder, action: 'confirm' | 'reminder' | 'delivery', date = '2026-10-29') => customerActionMessage(o, action, date, '2026-10-29', 'Shop');
const fulfilments = [
  { id: 'a', date: '2026-10-29', time: '12:30', method: 'delivery', allocations: [{ itemIndex: 0, quantity: 1 }] },
  { id: 'b', date: '2026-10-30', time: '18:00', method: 'pickup', pickupLocationAddress: 'Counter B', allocations: [{ itemIndex: 1, quantity: 1 }] }
] as StoreOrder['fulfilments'];
test('confirmation includes every date, allocated quantity and items without claiming unpaid payment', () => {
  const text = message(order({ fulfilments }), 'confirm');
  for (const value of ['Thursday, 29 Oct', 'Friday, 30 Oct', '1 x Rice', '1 x Soup', '12:30 PM', '6:00 PM', 'Counter B']) assert.ok(text.includes(value));
  assert.doesNotMatch(text, /Payment confirmed|[*_`]|&amp;|�/);
  assert.match(text, /Hi Aina & Ali,/);
  assert.match(message(order({ payment: { status: 'paid' } as StoreOrder['payment'] }), 'confirm'), /Payment confirmed\. Thank you!/);
});
test('reminder uses only the selected date and quantities, and has no entire-week fallback', () => {
  const text = message(order({ fulfilments }), 'reminder');
  assert.match(text, /1 x Rice/); assert.doesNotMatch(text, /Soup|2026-10-30/);
  assert.equal(message(order({ fulfilments }), 'reminder', '2026-11-01'), '');
});
test('weekly-only schedules independently select meals and dates', () => {
  const weeklyFulfilments = [
    { day: 'thu', date: '2026-10-29', productName: 'Thursday meal', quantity: 3, pickupTime: '13:00', pickupLocationAddress: 'A' },
    { day: 'fri', date: '2026-10-30', productName: 'Friday meal', quantity: 2, pickupTime: '14:00', pickupLocationAddress: 'B' }
  ] as StoreOrder['weeklyFulfilments'];
  assert.match(message(order({ weeklyFulfilments }), 'confirm'), /Friday meal/);
  const text = message(order({ weeklyFulfilments }), 'reminder');
  assert.match(text, /3 x Thursday meal/); assert.doesNotMatch(text, /Friday meal|Rice/);
});
test('weekly components use allocated meal names instead of plan names', () => {
  const o = order({ items: [{ productName: 'Weekly Plan', weeklyPlanSnapshot: { meals: [{ day: 'thu', productName: 'Thursday curry' }] } }] as StoreOrder['items'], fulfilments: [{ ...fulfilments![0], allocations: [{ itemIndex: 0, quantity: 4, componentDay: 'thu' }] }] });
  assert.match(message(o, 'reminder'), /4 x Thursday curry/); assert.doesNotMatch(message(o, 'reminder'), /Weekly Plan/);
});
test('delivery always selects today and uses date-specific actual status and link', () => {
  const o = order({ fulfilments, delivery: { recipient: { address: 'Home' }, providerOrder: { shareLink: 'https://wrong.example/parent' }, lifecycle: { state: 'completed' } } as StoreOrder['delivery'], fulfilmentOperations: { a: { lifecycle: { state: 'picked_up' }, providerOrder: { shareLink: 'https://www.lalamove.com/track/a' } } } });
  const text = message(o, 'delivery', '2026-10-30');
  assert.match(text, /On the way/); assert.match(text, /https:\/\/www.lalamove.com\/track\/a/);
  assert.doesNotMatch(text, /Soup|completed|wrong.example|2026-10-30/);
  assert.doesNotMatch(message(order({ fulfilments }), 'delivery'), /Lalamove tracking/);
});
test('single delivery uses provider status without inventing delivery completion', () => {
  const text = message(order({ fulfilmentMethod: 'delivery', delivery: { fulfilmentMethod: 'delivery', schedule: { date: '2026-10-29', time: '17:00' }, recipient: { address: 'Home' }, lifecycle: { state: 'assigning_driver' }, providerOrder: { shareLink: 'javascript:alert(1)' } } }), 'delivery');
  assert.match(text, /Finding a driver/); assert.match(text, /Home/); assert.doesNotMatch(text, /Lalamove tracking/);
});
test('WhatsApp Web link round-trips plain line breaks and international phone', () => {
  const o = order(); const text = message(o, 'confirm'); const url = new URL(customerActionUrl(o, 'MY', text));
  assert.equal(url.origin, 'https://web.whatsapp.com'); assert.equal(url.searchParams.get('phone'), '60123456789');
  assert.equal(url.searchParams.get('text'), text); assert.ok(text.includes('\n'));
  assert.equal(customerActionUrl(order({ phone: 'invalid' }), 'MY', text), '');
  assert.equal(plainText('<b>Hello</b> &#38; *World* �'), 'Hello & World');
});
test('order details show exactly three WhatsApp actions and no sent claim on initial render', () => {
  const html = renderToStaticMarkup(<WhatsAppCustomerActions order={order()} country="MY" storeName="Shop" canRecordReminder />);
  for (const label of ['Confirm Order', 'Order Reminder', 'Delivery Update', 'Not recorded']) assert.ok(html.includes(label));
  assert.doesNotMatch(html, /Sent \(confirmed by owner\)/);
});

test('all multi-day delivery messages use the selected date snapshot address, time, method and allocations', () => {
  const o = order({ fulfilmentMethod: 'delivery', delivery: { fulfilmentMethod: 'delivery', recipient: { address: 'Stale parent address' } }, fulfilments: [
    { ...fulfilments![0], destination: { formattedAddress: 'Day One &amp; Address', latitude: '4.5', longitude: '101.1' } },
    { ...fulfilments![1], method: 'delivery', destination: { formattedAddress: 'Day Two Address', latitude: '4.6', longitude: '101.2' } }
  ] });
  const confirmation = message(o,'confirm');
  assert.match(confirmation,/Thursday, 29 Oct\nDelivery\nDelivery time: 12:30 PM\n1 x Rice\nDelivery address: Day One & Address/);
  assert.match(confirmation,/Friday, 30 Oct\nDelivery\nDelivery time: 6:00 PM\n1 x Soup\nDelivery address: Day Two Address/);
  assert.doesNotMatch(confirmation,/Stale parent|&amp;|[*_`�]/);
  const reminder = message(o,'reminder','2026-10-30');
  assert.match(reminder,/Day Two Address/); assert.doesNotMatch(reminder,/Day One|Rice|Stale parent/);
  const update = message(o,'delivery','2026-10-30');
  assert.match(update,/Day One & Address/); assert.doesNotMatch(update,/Day Two|Soup|Stale parent/);
});
test('manual customer-arranged delivery uses saved day notes; legacy orders retain parent address fallback', () => {
  const manual = order({ manualOrder: { revision:1, draft:{}, createdBy:'owner' }, fulfilmentMethod:'delivery', delivery:{fulfilmentMethod:'delivery',recipient:{address:'Wrong old parent'}}, fulfilments:[{...fulfilments![0],notes:'Customer arranged address for today'}] });
  assert.match(message(manual,'reminder'),/Delivery address: Customer arranged address for today/);
  assert.doesNotMatch(message(manual,'reminder'),/Wrong old parent/);
  const legacy = order({fulfilmentMethod:'delivery',delivery:{fulfilmentMethod:'delivery',recipient:{address:'Legacy saved address'}},fulfilments:[fulfilments![0]]});
  assert.match(message(legacy,'reminder'),/Legacy saved address/);
  const incomplete = order({ ...legacy, fulfilments:[{...fulfilments![0],destination:{formattedAddress:'',latitude:'4.5',longitude:'101.1'}}] });
  assert.doesNotMatch(message(incomplete,'reminder'),/Legacy saved address/);
});

test('both POS history and manual saved-order details reuse the shared actions and existing role permission', () => {
  const read = (name: string) => readFileSync(new URL(name,import.meta.url),'utf8');
  const pos = read('./StorePosPage.tsx');
  const manual = read('./ManualPosOrders.tsx');
  const app = read('../../App.tsx');
  const history = pos.slice(pos.indexOf('visibleHistoryOrders.map(order =>'));
  assert.match(history, /<WhatsAppCustomerActions order=\{order\}/);
  assert.match(manual, /<WhatsAppCustomerActions order=\{saved\}/);
  assert.match(pos,/canRecordReminder=\{canRecordReminders\}/);
  assert.match(app,/canRecordReminders=\{getStorePermissions\(currentWorkspaceRole\).processOrders\}/);
  for (const source of [pos,manual]) assert.doesNotMatch(source,/web\.whatsapp\.com\/send|customerActionMessage\(/);
});

test('single-day confirmation is warm, readable and omits internal timestamps', () => {
  const o = order({storeName:'GG Grab&Go',pickupDate:'2026-11-02',pickupTime:'16:30',createdAt:'2026-10-29T14:27:09.401Z',payment:{status:'paid'} as StoreOrder['payment']});
  const text = message(o,'confirm');
  assert.equal(text, [
    'Hi Aina & Ali,', '', 'Thank you for your order with GG Grab&Go!',
    'Order number: MC-1', 'Payment confirmed. Thank you!', '',
    'Pickup time: 4:30 PM', 'Pickup address: Counter A', '',
    'Monday, 2 Nov', 'Pickup', '2 x Rice', '1 x Soup', '',
    'Thank you for choosing us. Enjoy your meals!', 'GG Grab&Go'
  ].join('\n'));
  assert.doesNotMatch(text,/2026-|16:30|Order placed|[*_`~�]|&amp;/);
});

test('multi-day shared address and time appear once while meals stay grouped by date', () => {
  const o = order({fulfilments: [
    {...fulfilments![1],date:'2026-11-03',time:'16:30',pickupLocationAddress:'Shared counter'},
    {...fulfilments![0],date:'2026-11-02',method:'pickup',time:'16:30',pickupLocationAddress:'Shared counter'}
  ]});
  const text = message(o,'confirm');
  assert.equal(text.split('Shared counter').length-1,1);
  assert.equal(text.split('4:30 PM').length-1,1);
  assert.match(text,/Pickup time for all dates: 4:30 PM/);
  assert.match(text,/Monday, 2 Nov\nPickup\n1 x Rice\n\nTuesday, 3 Nov\nPickup\n1 x Soup/);
});

test('different addresses and times remain attached to their saved dates', () => {
  const text = message(order({fulfilments:[
    {...fulfilments![0],method:'pickup',date:'2026-11-02',time:'09:05',pickupLocationAddress:'Counter A'},
    {...fulfilments![1],date:'2026-11-03',time:'16:30',pickupLocationAddress:'Counter B'}
  ]}),'confirm');
  assert.match(text,/Monday, 2 Nov\nPickup\nPickup time: 9:05 AM\n1 x Rice\nPickup address: Counter A/);
  assert.match(text,/Tuesday, 3 Nov\nPickup\nPickup time: 4:30 PM\n1 x Soup\nPickup address: Counter B/);
  assert.doesNotMatch(text,/for all dates/);
});

test('address and time deduplication are independent, and missing values are never inherited', () => {
  const both = fulfilments!.map((f,i)=>({...f,method:'pickup' as const,time:i?'16:30':'09:00',pickupLocationAddress:'Shared counter'}));
  const text = message(order({fulfilments:both}),'confirm');
  assert.equal(text.split('Shared counter').length-1,1);
  assert.match(text,/9:00 AM/);assert.match(text,/4:30 PM/);
  const sameTime=message(order({fulfilments:both.map((f,i)=>({...f,time:'16:30',pickupLocationAddress:i?'Other counter':'Shared counter'}))}),'confirm');
  assert.equal(sameTime.split('4:30 PM').length-1,1);
  assert.match(sameTime,/Other counter/);assert.match(sameTime,/Shared counter/);
  const missing=message(order({fulfilments:both.map((f,i)=>({...f,time:i?'':'16:30',pickupLocationAddress:i?'':'Known counter'}))}),'confirm');
  assert.doesNotMatch(missing,/for all dates/);
  assert.equal(missing.split('Known counter').length-1,1);
  assert.doesNotMatch(missing.split('Friday, 30 Oct')[1],/Known counter|4:30 PM/);
});

test('mixed pickup and delivery retain the method, address and time for every date', () => {
  const o = order({fulfilments:[
    {...fulfilments![0],date:'2026-11-02',time:'16:30',destination:{formattedAddress:'Saved home address',latitude:'4.5',longitude:'101.1'}},
    {...fulfilments![1],date:'2026-11-03',time:'12:00'}
  ]});
  const text=message(o,'confirm');
  assert.match(text,/Monday, 2 Nov\nDelivery\nDelivery time: 4:30 PM\n1 x Rice\nDelivery address: Saved home address/);
  assert.match(text,/Tuesday, 3 Nov\nPickup\nPickup time: 12:00 PM\n1 x Soup\nPickup address: Counter B/);
  const shared=message(order({fulfilments:o.fulfilments!.map(f=>({...f,time:'16:30',destination:undefined,pickupLocationAddress:'Same saved address'})),delivery:{recipient:{address:'Same saved address'}} as StoreOrder['delivery']}),'confirm');
  assert.equal(shared.split('Same saved address').length-1,1);
  assert.equal(shared.split('4:30 PM').length-1,1);
  assert.match(shared,/\nDelivery\n/);assert.match(shared,/\nPickup\n/);
});

test('same-date meals group together and all actions use matching customer-friendly formatting', () => {
  const o=order({storeName:'GG Grab&Go',createdAt:'2026-10-29T14:27:09.401Z',fulfilments:fulfilments!.map(f=>({...f,date:'2026-10-29',time:'16:30'}))});
  for(const action of ['confirm','reminder','delivery'] as const){
    const text=message(o,action);
    assert.equal(text.split('Thursday, 29 Oct').length-1,1);
    assert.equal(text.split('4:30 PM').length-1,1);
    for(const value of ['1 x Rice','1 x Soup','Order number: MC-1','Enjoy your meals!','GG Grab&Go'])assert.ok(text.includes(value));
    assert.doesNotMatch(text,/2026-|16:30|[*_`~�]|&amp;|Order placed/);
  }
});

test('date-only formatting is calendar-safe and missing information stays unspecified', () => {
  const text=message(order({customerName:'',orderNumber:'',pickupDate:'2026-02-30',pickupTime:'2026-10-29T14:27:09.401Z',pickupLocationAddress:''}),'confirm');
  assert.match(text,/Hi there,/);assert.match(text,/Date not specified/);
  assert.doesNotMatch(text,/2026-|March|Order number:|time:|address:/);
  for(const [saved,expected] of [['00:00','12:00 AM'],['12:00','12:00 PM'],['23:59','11:59 PM'],['4:30 pm','4:30 PM'],['Lunch','Lunch'],['4 PM','4:00 PM'],['16:30 - 18:00','4:30 PM - 6:00 PM']]){
    assert.ok(message(order({pickupTime:saved}),'confirm').includes(`Pickup time: ${expected}`));
  }
  assert.doesNotMatch(message(order({pickupTime:'25:80'}),'confirm'),/25:80|time:/);
  for(const status of ['pending','failed','pending_verification','refunded']){
    const unpaid=message(order({payment:{status} as StoreOrder['payment']}),'confirm');
    assert.doesNotMatch(unpaid,/Payment confirmed/);assert.match(unpaid,/Payment has not been confirmed/);
  }
});
