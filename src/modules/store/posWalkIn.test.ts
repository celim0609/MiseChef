import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./posWalkIn.ts', import.meta.url), 'utf8');

test('walk-in receipt writes complete HTML before printing', () => {
  assert.match(source, /popup\.document\.open\(\)/);
  assert.match(source, /popup\.document\.write\(receiptHtml\)/);
  assert.match(source, /popup\.document\.close\(\)/);
  assert.match(source, /popup\.print\(\)/);
  assert.ok(source.indexOf('popup.document.write(receiptHtml)') < source.indexOf('popup.print()'));
});

test('walk-in receipt does not request noopener in window features', () => {
  assert.match(source, /window\.open\('', '_blank', 'width=360,height=640'\)/);
  assert.doesNotMatch(source, /window\.open\('', '_blank', '[^']*noopener/);
});

test('walk-in receipt remains thermal and includes core order content', () => {
  assert.match(source, /size:80mm auto/);
  assert.match(source, /Order:/);
  assert.match(source, /Walk-in/);
  assert.match(source, /Payment: Paid \/ Walk-in/);
  assert.match(source, /selectedOptions/);
});


test('customer receipt includes paid totals, identity and full scheduled delivery without changing the order', async () => {
 const { printCustomerReceipt } = await import('./posWalkIn');
 const order = {id:'receipt',storeName:'Store',orderNumber:'MC-1',customerName:'<Alice>',phone:'0123456789',currency:'MYR',total:25,createdAt:'2026-10-20T01:00:00Z',payment:{status:'paid'},fulfilmentMethod:'delivery',pickupDate:'2026-10-21',pickupTime:'12:00',delivery:{recipient:{address:'25 Full Street, 31400 Ipoh',instructions:'Unit B-12'}},items:[{productName:'Rice',quantity:1,lineTotal:25,selectedOptions:[]}]} as import('./types').StoreOrder;
 const original=JSON.stringify(order);const documents:string[]=[];let prints=0;
 const previous=globalThis.window;
 globalThis.window={open:()=>({document:{readyState:'complete',open(){},write(html:string){documents.push(html)},close(){}},focus(){},print(){prints++;}}),setTimeout(fn:()=>void){fn();}} as unknown as Window & typeof globalThis;
 try {
  printCustomerReceipt(order);
  assert.equal(prints,1);
  for(const value of ['MYR 25.00','&lt;Alice&gt;','0123456789','25 Full Street, 31400 Ipoh','Unit B-12','2026-10-21','Payment: Paid']) assert.ok(documents[0].includes(value),value);
  assert.equal(JSON.stringify(order),original);
  printCustomerReceipt({...order,payment:{...order.payment,status:'pending'}});
  assert.equal(prints,1);
 } finally {globalThis.window=previous;}
});
