import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTicketDocument, getOrderTickets, printOrderTickets } from './orderTickets';
import type { StoreOrder } from './types';
const order = { id: 'order-1', storeName: 'GG Grab&Go', orderNumber: 'GG-123', customerName: '<Alice>', pickupCode: 'AB12', pickupDate: '2026-10-19', pickupTime: '12:00', fulfilmentMethod: 'pickup', fulfilmentStatus: 'Preparing', notes: 'No chilli', createdAt: '2026-10-18T01:00:00Z', payment: {status:'paid'}, items: [{productName:'Rice',quantity:2,selectedOptions:[{groupName:'Size',optionName:'Large',quantity:2,priceAdjustment:98765}],lineTotal:98765},{productName:'Noodles',quantity:1,selectedOptions:[]}] } as StoreOrder;
test('single day ticket includes identity, pickup schedule, quantity, modifiers and notes without prices', () => {
 const html = buildTicketDocument(getOrderTickets(order));
 for (const value of ['GG Grab&amp;Go','GG-123','AB12','&lt;Alice&gt;','2026-10-19 12:00','Pickup','2 × Rice','Size: Large ×2','No chilli']) assert.ok(html.includes(value),value);
 assert.ok(!html.includes('98765')); assert.ok(!html.includes('<Alice>'));
});
test('multi-day allocations isolate selected day for pickup and delivery', () => {
 const multi = {...order,fulfilments:[{id:'first',date:'2026-10-19',time:'13:00',method:'delivery',allocations:[{itemIndex:0,quantity:1}]},{id:'second',date:'2026-10-20',time:'14:00',method:'pickup',allocations:[{itemIndex:1,quantity:1}]}]} as StoreOrder;
 const tickets = getOrderTickets(multi); const html = buildTicketDocument([tickets[0]]);
 assert.ok(html.includes('Delivery')); assert.ok(html.includes('1 × Rice')); assert.ok(!html.includes('Noodles')); assert.ok(!html.includes('2026-10-20'));
});
test('weekly component uses actual day meal and options, never parent plan or other days', () => {
 const multi = {...order,items:[{...order.items[0],productName:'Weekly plan',weeklyPlanSnapshot:{meals:[{day:'mon',productName:'Monday meal',selectedMealOptions:[{optionGroupName:'Sauce',optionName:'Lemon',priceAdjustmentMinor:98765}]},{day:'tue',productName:'Tuesday meal'}]}}],fulfilments:[{id:'mon',date:'2026-10-19',time:'12:00',method:'pickup',allocations:[{itemIndex:0,quantity:2,componentDay:'mon'}]}]} as StoreOrder;
 const html = buildTicketDocument(getOrderTickets(multi)); assert.ok(html.includes('Monday meal')); assert.ok(html.includes('Sauce: Lemon')); assert.ok(!html.includes('Tuesday meal')); assert.ok(!html.includes('Weekly plan')); assert.ok(!html.includes('98765'));
});
test('A4 batches have eight cells per sheet, two columns and four rows', () => {
 const ticket = getOrderTickets(order)[0]; const html = buildTicketDocument(Array(9).fill(ticket));
 assert.equal((html.match(/class="sheet"/g)||[]).length,2); assert.equal((html.match(/<article>/g)||[]).length,9);
 assert.ok(html.includes('size:A4'));assert.ok(html.includes('repeat(2,minmax(0,1fr))'));assert.ok(html.includes('repeat(4,minmax(0,1fr))'));assert.ok(html.includes('dashed'));assert.ok(html.includes('@media print'));
});
test('printing and reprinting write identical documents and preserve every order field', () => {
 const original = JSON.stringify(order); const documents:string[]=[]; let prints=0;
 const previous = globalThis.window;
 globalThis.window = {open:()=>({opener:null,document:{open(){},write(html:string){documents.push(html)},close(){}},setTimeout(fn:()=>void){fn()},focus(){},print(){prints++}})} as unknown as Window & typeof globalThis;
 try {const tickets=getOrderTickets(order);printOrderTickets(tickets);printOrderTickets(tickets);assert.equal(prints,2);assert.equal(documents[0],documents[1]);assert.equal(JSON.stringify(order),original);} finally {globalThis.window=previous;}
});
test('legacy weekly fulfilments retain day snapshots and missing weekly schedule cannot leak all days', () => {
 const legacy = {...order,weeklyFulfilments:[{day:'mon',date:'2026-10-19',pickupTime:'11:00',productName:'Legacy meal',quantity:3}]} as StoreOrder;
 assert.equal(getOrderTickets(legacy)[0].items[0].name,'Legacy meal');
 assert.deepEqual(getOrderTickets({...order,items:[{...order.items[0],weeklyPlanSnapshot:{meals:[]}}]}),[]);
});
test('kitchen ticket uses selected preparation snapshot without financial fields', () => {
 const html=buildTicketDocument([getOrderTickets(order)[0]],'kitchen');assert.ok(html.includes('Kitchen Ticket'));assert.ok(html.includes('No chilli'));assert.ok(!html.includes('98765'));
});
test('empty batches fail before opening a print window', () => {assert.throws(()=>buildTicketDocument([]),/Select/);});

test('customer bag ticket includes reorder contacts but kitchen ticket does not', () => {
 const ticket = getOrderTickets(order)[0];
 const customer = buildTicketDocument([ticket], 'customer');
 const kitchen = buildTicketDocument([ticket], 'kitchen');
 for (const value of ['Thank you for your order!', 'Freshly prepared with care.', 'misechef.ai/store/misechef-s-grab-go-store', '016-4209116', '@misechef.ai', 'Powered by MiseChef']) {
   assert.ok(customer.includes(value), value);
   assert.ok(!kitchen.includes(value), value);
 }
});
