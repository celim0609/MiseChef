import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import WhatsAppCustomerActions from './WhatsAppCustomerActions';
import WhatsAppMessagePreview from './WhatsAppMessagePreview';
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
  assert.match(message(order({ payment: { status: 'paid' } as StoreOrder['payment'] }), 'confirm'), /Payment status: paid/);
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
  for (const label of ['Confirm Order', 'Pickup Reminder', 'Delivery Update', 'Not recorded']) assert.ok(html.includes(label));
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
    'Order number: MC-1', 'Payment status: paid', 'Subtotal: Not available',
    'Delivery Fee: Not available', 'Final Total: Not available', '',
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
    for(const value of ['1 x Rice','Order number: MC-1','Enjoy your meals!','GG Grab&Go'])assert.ok(text.includes(value));
    assert.equal(text.includes('1 x Soup'), action !== 'delivery');
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
    assert.doesNotMatch(unpaid,/Payment confirmed/);assert.ok(unpaid.includes(`Payment status: ${status.replaceAll('_', ' ')}`));
  }
});

test('saved completion wins over Ready and stale provider state only for its own date', () => {
  for(const method of ['delivery'] as const){
    const o=order({fulfilments:fulfilments!.map(f=>({...f,method})),fulfilmentCompletion:{a:{completedAt:'2026-10-29T08:00:00Z',completedBy:'owner'}},fulfilmentOperations:{a:{kitchenStatus:'Ready',lifecycle:{state:'driver_assigned'}},b:{kitchenStatus:'Preparing'}}});
    const today=message(o,'delivery');
    assert.match(today,new RegExp(`Delivery status: Completed`));
    assert.doesNotMatch(today,/status: Ready|Driver assigned|Soup/);
    const future=customerActionMessage(o,'delivery','2026-10-29','2026-10-30','Shop');
    assert.match(future,/Preparing your meals/);assert.doesNotMatch(future,/status: Completed|Rice/);
  }
});
test('parent completion and cancellation are respected for ordinary and weekly schedules', () => {
  const delivered=order({fulfilmentStatus:'Completed',fulfilmentMethod:'delivery',delivery:{fulfilmentMethod:'delivery',schedule:{date:'2026-10-29',time:'12:30'},lifecycle:{state:'driver_assigned'}}});
  assert.match(message(delivered,'delivery'),/Delivery status: Completed/);
  assert.match(message(order({fulfilmentStatus:'Completed',fulfilments}),'delivery'),/Delivery status: Completed/);
  const weekly=order({fulfilmentStatus:'Completed',weeklyFulfilments:[{day:'thu',date:'2026-10-29',productName:'Lunch',quantity:1}] as StoreOrder['weeklyFulfilments']});
  assert.equal(message(weekly,'delivery'), '');
  assert.match(message({...weekly,fulfilmentMethod:'delivery',fulfilmentStatus:'Cancelled'},'delivery'),/Delivery status: Cancelled/);
});
test('confirmation displays saved total and currency without using payment amounts or item arithmetic', () => {
  for(const currency of ['MYR','SGD'] as const){
    const o=order({currency,total:32,payment:{status:'paid',amountMinor:999999,currency:currency==='MYR'?'SGD':'MYR'} as StoreOrder['payment'],totals:{grandTotal:999} as StoreOrder['totals']});
    const before=structuredClone(o);const text=message(o,'confirm');
    assert.match(text,new RegExp(`Final Total: ${currency} 32\\.00`));assert.match(text,/Payment status: paid/);
    assert.doesNotMatch(text,/999|Amount paid|Total Paid/);assert.deepEqual(o,before);
    assert.match(message({...o,payment:{...o.payment,status:'pending'}},'confirm'),/Payment status: pending/);
    assert.match(message({...o,payment:{...o.payment,status:'pending'}},'confirm'),new RegExp(`Final Total: ${currency} 32\\.00`));
  }
});
test('unknown, invalid or normalized-default totals are unavailable; saved zero remains valid', () => {
  for(const total of [undefined,null,NaN,Infinity,-1,'32'] as const)assert.match(message(order({currency:'MYR',total} as Partial<StoreOrder>),'confirm'),/Final Total: Not available/);
  assert.match(message(order({currency:undefined,total:32,payment:{status:'paid',amountMinor:3200,currency:'MYR'} as StoreOrder['payment']}),'confirm'),/Final Total: Not available/);
  assert.match(message(order({currency:'SGD',total:0,hasSavedCommunicationTotal:false}),'confirm'),/Final Total: Not available/);
  assert.match(message(order({currency:'MYR',total:0,hasSavedCommunicationTotal:true}),'confirm'),/Final Total: MYR 0\.00/);
});

test('isolated Healthy Lunch fixture keeps the gift, notes and address on their saved dates', () => {
  const o = order({
    orderSource: 'online', currency: 'MYR', total: 43, notes: 'Pack separately',
    totals: { merchandiseSubtotal: 40, discountTotal: 6, discountedMerchandiseTotal: 34, deliveryFee: 9, grandTotal: 43, currency: 'MYR' },
    deliveryPricingSnapshot: { days: [
      { date: '2026-10-29', customerDeliveryFee: 0 }, { date: '2026-10-30', customerDeliveryFee: 9 }
    ] },
    promotionSnapshot: { appliedPromotions: [{ name: '11.11 Lunch deal' }] } as StoreOrder['promotionSnapshot'],
    items: [
      { productName: 'Healthy Lunch Chicken Rice', quantity: 1, notes: 'No onions',
        healthyLunchSnapshot: { planId: 'healthy', date: '2026-10-29' } },
      { productName: 'Healthy Lunch Fish Bowl', quantity: 1, notes: 'Sauce on the side',
        healthyLunchSnapshot: { planId: 'healthy', date: '2026-10-30' } },
      { productName: 'Iced Lime Tea', quantity: 2, complimentary: true, notes: 'Less ice' },
    ] as StoreOrder['items'],
    fulfilments: [
      { ...fulfilments![0], destination: { formattedAddress: 'First address', latitude: '4', longitude: '101' } },
      { ...fulfilments![1], method: 'delivery', notes: 'Internal kitchen note',
        destination: { formattedAddress: 'Second address', latitude: '4', longitude: '101' },
        allocations: [{ itemIndex: 1, quantity: 1 }, { itemIndex: 2, quantity: 1 }, { itemIndex: 2, quantity: 1 }] }
    ],
    fulfilmentOperations: { b: { providerOrder: { shareLink: 'https://lalamove.com/stale' } } }
  });
  const confirmation = message(o, 'confirm');
  for (const value of ['Subtotal: MYR 40.00', 'Delivery Fee: MYR 9.00', 'Discounts: −MYR 6.00',
    'Final Total: MYR 43.00', 'Promotions: 11.11 Lunch deal', 'Pack separately', 'No onions',
    'Sauce on the side', 'Less ice']) assert.ok(confirmation.includes(value), value);
  assert.doesNotMatch(confirmation.split('Friday, 30 Oct')[0], /Iced Lime Tea/);
  assert.match(confirmation.split('Friday, 30 Oct')[1], /2 x Iced Lime Tea \(complimentary\)/);
  const firstReminder = message(o, 'reminder');
  assert.match(firstReminder, /Healthy Lunch Chicken Rice/);
  assert.match(firstReminder, /No onions/);
  assert.doesNotMatch(firstReminder, /Iced Lime Tea|Sauce on the side|Second address/);
  const secondReminder = message(o, 'reminder', '2026-10-30');
  for (const value of ['2 x Iced Lime Tea (complimentary)', 'Sauce on the side', 'Less ice',
    'Pack separately', '6:00 PM', 'Second address']) assert.ok(secondReminder.includes(value), value);
  assert.doesNotMatch(secondReminder, /Chicken Rice|No onions|Internal kitchen note/);
  assert.equal(secondReminder.match(/ x Iced Lime Tea/g)?.length, 1);

  const update = customerActionMessage(o, 'delivery', '', '2026-10-30', 'Shop', { provider: 'Private Driver' });
  assert.match(update, /Private Driver/);
  assert.match(update, /Second address/);
  assert.match(update, /2 x Iced Lime Tea/);
  assert.doesNotMatch(update, /lalamove|First address|Internal kitchen note|Track your delivery/i);
  const edited = `${update}\nPlease meet the driver at the lobby.`;
  const html = renderToStaticMarkup(<WhatsAppMessagePreview order={o} country="MY" message={edited}
    onChange={() => {}} onClose={() => {}} />);
  assert.match(html, /WhatsApp Preview/);
  const href = html.match(/href="([^"]+)"/)?.[1]?.replaceAll('&amp;', '&').replaceAll('&#x27;', "'");
  assert.ok(href);
  assert.equal(new URL(href).searchParams.get('text'), edited);
});

test('pickup reminder keeps pickup address, time, code and customer notes', () => {
  const text = message(order({ orderSource: 'online', pickupCode: 'P123', notes: 'Pack separately' }), 'reminder');
  for (const value of ['Pickup code: P123', '12:30 PM', 'Counter A', '2 x Rice', 'Pack separately']) {
    assert.ok(text.includes(value), value);
  }
});

test('private and Grab delivery updates omit stale Lalamove data and use optional supplied tracking', () => {
  const o = order({
    fulfilments: [{ ...fulfilments![0], destination: { formattedAddress: 'Saved home', latitude: '4', longitude: '101', deliveryInstructions: 'Ring twice' } }, fulfilments![1]],
    fulfilmentOperations: { a: { lifecycle: { state: 'driver_assigned' }, providerOrder: { shareLink: 'https://lalamove.com/stale' } } }
  });
  const update = (provider: 'Lalamove' | 'Grab' | 'Private Driver', tracking?: string) =>
    customerActionMessage(o, 'delivery', '', '2026-10-29', 'Shop', { provider, tracking });
  assert.match(update('Lalamove'), /https:\/\/lalamove.com\/stale/);
  assert.match(update('Grab', 'https://grab.com/track'), /https:\/\/grab.com\/track/);
  const privateUpdate = update('Private Driver', 'javascript:alert(1)');
  for (const value of ['Private Driver', 'Saved home', 'Ring twice', '1 x Rice']) assert.ok(privateUpdate.includes(value));
  assert.doesNotMatch(privateUpdate, /Lalamove|lalamove|Driver assigned|Track your delivery|Soup/);
});

test('staff-only and ambiguous notes are excluded from every customer action', () => {
  const base = order({
    notes: 'STAFF order note',
    pickupLocationNotes: 'STAFF location note',
    items: [{ productName: 'Rice', notes: 'STAFF item note', quantity: 1 }] as StoreOrder['items'],
    fulfilments: [{ ...fulfilments![0], notes: 'STAFF day note', destination: {
      formattedAddress: 'Saved customer address', latitude: '4', longitude: '101', deliveryInstructions: 'Ring the bell'
    } }]
  });
  for (const source of [{ orderSource: 'pos' as const }, { orderSource: undefined },
    { orderSource: 'online' as const, hasSavedOnlineSource: false }]) {
    for (const action of ['confirm', 'reminder', 'delivery'] as const) {
      const text = message({ ...base, ...source }, action);
      assert.match(text, /Ring the bell/);
      assert.doesNotMatch(text, /STAFF/);
    }
  }
});
