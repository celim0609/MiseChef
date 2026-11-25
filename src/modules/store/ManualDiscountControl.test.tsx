import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ManualDiscountControl,{previewPosDiscount} from './ManualDiscountControl';
import {applyManualDiscount,calculatePromotionPricing} from '../../../functions/storePromotionPricing.js';
import {customerActionMessage} from './customerCommunicationModel';
import {printCustomerReceipt,printCustomerInvoice} from './posWalkIn';
import {projectOrderSalesRecords} from '../business/dailySalesProjection';
import {calculateBusinessAccounting} from '../business/accounting';
import type {StoreOrder} from './types';
const items=[{productId:'food',productName:'Lunch',quantity:1,basePrice:20.01,lineTotal:20.01,selectedOptions:[]}];
const discount={type:'percentage' as const,value:12.5,reason:'Goodwill'};
const pricing=applyManualDiscount({items,pricing:calculatePromotionPricing({items}),discount,authorized:true,uid:'owner'});
const order={id:'discount',orderNumber:'MC-DISCOUNT',storeName:'Store',customerName:'QA',phone:'0164209116',currency:'MYR',orderSource:'pos',externalOrder:{source:'walk_in'},createdAt:'2026-11-25T01:00:00Z',total:24.51,totals:{...pricing,deliveryFee:7,grandTotal:24.51,currency:'MYR'},manualDiscountSnapshot:{...pricing.manualDiscountSnapshot,finalTotal:24.51},promotionSnapshot:pricing.promotionSnapshot,items,payment:{status:'paid',refundStatus:'none',refundedAmountMinor:0,amountMinor:2451},fulfilmentStatus:'Completed',completedAt:'2026-11-26T04:00:00Z',fulfilments:[{id:'daily',date:'2026-11-26',time:'12:00',method:'delivery',destination:{formattedAddress:'School gate'},allocations:[{itemIndex:0,quantity:1}]}],fulfilmentCompletion:{daily:{completedAt:'2026-11-26T04:00:00Z'}}} as unknown as StoreOrder;
test('discount preview uses backend cents math and validates quantity changes',()=>{
 assert.deepEqual(previewPosDiscount(items,discount,true),{amountMinor:250,error:''});
 assert.match(previewPosDiscount(items,discount,false).error,/Owner or Manager/);
 assert.match(previewPosDiscount(items,{type:'fixed_amount',value:21},true).error,/subtotal/);
});
test('inline discount controls are restricted and expose apply, edit, remove without popups',()=>{
 const props={items,authorized:true,onChange:()=>{}};
 assert.equal(renderToStaticMarkup(<ManualDiscountControl {...props} authorized={false}/>),'');
 assert.match(renderToStaticMarkup(<ManualDiscountControl {...props}/>),/Apply Discount/);
 const applied=renderToStaticMarkup(<ManualDiscountControl {...props} value={discount}/>);
 for(const label of ['Edit discount','Remove discount','12.5%','Goodwill'])assert.ok(applied.includes(label),label);
});
test('receipts and customer invoices show original subtotal, discount, delivery and payable without mutating order',()=>{
 const original=JSON.stringify(order),documents:string[]=[];
 const previous=globalThis.window;
 globalThis.window={open:()=>({document:{readyState:'complete',open(){},write(html:string){documents.push(html);},close(){}},focus(){},print(){}}),setTimeout(fn:()=>void){fn();}} as unknown as Window & typeof globalThis;
 try{
  printCustomerReceipt(order);printCustomerInvoice(order);
  assert.equal(documents.length,2);
  for(const html of documents)for(const label of ['Subtotal','MYR 20.01','Discount (12.5%)','MYR 2.50','Delivery fee','MYR 7.00','MYR 24.51'])assert.ok(html.includes(label),label);
  assert.ok(documents[1].includes('Customer invoice'));
  printCustomerInvoice({...order,payment:{...order.payment,status:'pending'}});assert.equal(documents.length,2);
  assert.equal(JSON.stringify(order),original);
 }finally{globalThis.window=previous;}
});
test('WhatsApp summary, Sales Records and financial report reconcile to saved discounted amount',()=>{
 const message=customerActionMessage(order,'confirm','','','Store');
 for(const value of ['20.01','2.50','7.00','24.51'])assert.ok(message.includes(value),value);
 const rows=projectOrderSalesRecords(order);assert.equal(rows.length,1);
 assert.equal(rows[0].grossMinor,2701);assert.equal(rows[0].discountMinor,250);assert.equal(rows[0].merchandiseMinor,1751);assert.equal(rows[0].deliveryMinor,700);assert.equal(rows[0].totalMinor,2451);
 const report=calculateBusinessAccounting({from:'2026-11-26',to:'2026-11-26',invoices:[],manualSales:[],storeOrders:[order],timeZone:'Asia/Kuala_Lumpur'});
 assert.equal(report.totalSales,24.51);
 assert.equal(report.salesRecords[0].discountMinor,250);
});
test('daily discount allocations and recognized sales reconcile across multiple fulfilment dates',()=>{
 const multi={...order,items:[{...items[0],productId:'weekly',productName:'Weekly Menu',quantity:1,lineTotal:30.01}],total:29.01,totals:{merchandiseSubtotal:30.01,discountTotal:1,discountedMerchandiseTotal:29.01,deliveryFee:0,grandTotal:29.01,currency:'MYR'},promotionSnapshot:{version:1,appliedPromotions:[],lineAdjustments:[{productId:'weekly',productName:'Weekly Menu',quantity:1,originalLineTotal:30.01,discountAmount:1,finalLineTotal:29.01}]},fulfilments:['2026-11-26','2026-11-27'].map((date,index)=>({id:`day${index}`,date,time:'12:00',method:'pickup',allocations:[{itemIndex:0,quantity:1}]})),fulfilmentCompletion:{day0:{completedAt:'2026-11-26T04:00:00Z'},day1:{completedAt:'2026-11-27T04:00:00Z'}}} as unknown as StoreOrder;
 const entries=projectOrderSalesRecords(multi);
 assert.equal(entries.reduce((sum,row)=>sum+row.discountMinor,0),100);
 assert.equal(entries.reduce((sum,row)=>sum+row.totalMinor,0),2901);
 assert.equal(entries.reduce((sum,row)=>sum+row.grossMinor,0),3001);
});
test('legacy receipts do not invent a zero delivery fee when the saved amount is unavailable',()=>{
 const documents:string[]=[],previous=globalThis.window;
 globalThis.window={open:()=>({document:{readyState:'complete',open(){},write(html:string){documents.push(html);},close(){}},focus(){},print(){}}),setTimeout(fn:()=>void){fn();}} as unknown as Window & typeof globalThis;
 try{printCustomerReceipt({...order,totals:undefined});assert.match(documents[0],/<span>Delivery fee<\/span><span>Not available<\/span>/);}finally{globalThis.window=previous;}
});
