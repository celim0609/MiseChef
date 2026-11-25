import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import type { StoreOrder } from './types';
import { deliveryPricingBreakdown, deliveryPricingTotals } from './deliveryPricingBreakdown';
import MerchantDeliveryPricing, { DeliveryPricingContent } from './MerchantDeliveryPricing';
import { getStorePermissions } from '../team/permissions';
const fixture = (): StoreOrder => ({
  id: 'test', workspaceId: 'workspace', currency: 'MYR', fulfilmentMethod: 'delivery',
  fulfilments: ['2026-11-30','2026-12-01','2026-12-02','2026-12-03','2026-12-04'].map((date, i) => ({ id: `day${i}`, method: 'delivery', date, time: '11:00', allocations: [] })),
  deliveryPricingSnapshot: { days: ['2026-11-30','2026-12-01','2026-12-02','2026-12-03','2026-12-04'].map(date => ({date, providerDeliveryFee:12.4,customerDeliveryFee:14.4,collectedBufferMinor:200,maximumExtraCostMinor:500})) },
  delivery: {fulfilmentMethod:'delivery',dayQuotes:['2026-11-30','2026-12-01','2026-12-02','2026-12-03','2026-12-04'].map((date,i)=>({date,quote:{quotationId:`original${i}`,fee:12.4}}))}
} as StoreOrder);
test('Weekly Menu preserves all daily amounts, aggregates in sen, and never mutates snapshots', () => {
  const order=fixture(), before=structuredClone(order);
  const trips=deliveryPricingBreakdown(order), totals=deliveryPricingTotals(trips);
  assert.equal(totals.originalMinor,6200); assert.equal(totals.bufferMinor,1000);assert.equal(totals.customerMinor,7200);
  assert.equal(totals.maximumExtraMinor,2500); assert.equal(totals.estimatedBalanceMinor,1000);assert.equal(totals.finalBalanceMinor,undefined);
  assert.deepEqual(order,before);assert.equal(trips[0].protection,'Awaiting latest quotation');
});
test('latest quote does not rewrite original quote and a booking timestamp is not a quotation timestamp',()=>{
  const order=fixture();order.fulfilmentOperations={day0:{dispatch:{operationalQuote:{fee:15.4,quotationId:'new'},submissionStartedAt:'2026-11-30T02:00:00Z'}}};
  const day=deliveryPricingBreakdown(order)[0];assert.equal(day.originalMinor,1240);assert.equal(day.latestMinor,1540);assert.equal(day.estimatedBalanceMinor,-100);
  assert.equal(day.latestQuotedAt,undefined);assert.equal(day.latestRecordedAt,'2026-11-30T02:00:00Z');assert.equal(day.protection,'Within saved limit (estimate)');
});
test('only completed provider costs establish final balance, including zero cost',()=>{
 const order=fixture();order.fulfilmentOperations={day0:{providerOrder:{priceBreakdown:{total:'15.40'}}}};
 assert.equal(deliveryPricingBreakdown(order)[0].finalBalanceMinor,undefined);
 order.fulfilmentOperations.day0.lifecycle={state:'completed'};
 assert.equal(deliveryPricingBreakdown(order)[0].finalBalanceMinor,-100);
 order.fulfilmentOperations.day0.providerOrder.priceBreakdown.total=0;
 assert.equal(deliveryPricingBreakdown(order)[0].finalBalanceMinor,1440);
});
test('protection boundary uses accepted buffer and limit and never current settings',()=>{
 const order=fixture();order.fulfilmentOperations={day0:{bookingPreview:{quote:{fee:19.4}}}};
 assert.equal(deliveryPricingBreakdown(order)[0].protection,'Within saved limit (estimate)');
 order.fulfilmentOperations.day0.bookingPreview.quote.fee=19.41;
 assert.equal(deliveryPricingBreakdown(order)[0].protection,'Exceeds saved limit (estimate)');
});
test('unknown policy, incomplete totals and unordered quotes are not fabricated',()=>{
 const order=fixture();delete order.deliveryPricingSnapshot.days[0].collectedBufferMinor;
 order.fulfilmentOperations={day0:{bookingPreview:{quote:{fee:16,quotationId:'a'}},dispatch:{operationalQuote:{fee:17,quotationId:'b'}}}};
 const trips=deliveryPricingBreakdown(order);assert.equal(trips[0].latestAmbiguous,true);assert.equal(trips[0].latestMinor,undefined);assert.equal(trips[0].estimatedBalanceMinor,undefined);assert.equal(deliveryPricingTotals(trips).bufferMinor,undefined);
 assert.equal(trips[0].protection,'Saved protection policy unavailable');
});
test('legacy multi-day records never reuse the first raw quote as a quote ID for every day',()=>{
 const order=fixture();delete order.delivery.dayQuotes;order.delivery.quote={fee:12.4,quotationId:'first'};
 const trips=deliveryPricingBreakdown(order);assert.equal(trips[0].quotationId,'first');assert.equal(trips[1].quotationId,undefined);
});
test('merchant disclosure is Owner/Manager only and fails closed for a different workspace',()=>{
 const order=fixture();
 for(const role of ['Owner','Manager','Chef','Finance','Viewer',undefined] as const){
 const canView=getStorePermissions(role).manageStoreSettings;
 const html=renderToStaticMarkup(<MerchantDeliveryPricing order={order} workspaceId="workspace" canView={canView}/>);
 assert.equal(html.includes('Delivery pricing breakdown'),role==='Owner'||role==='Manager');
 }
 assert.equal(renderToStaticMarkup(<MerchantDeliveryPricing order={order} workspaceId="other" canView/>),'');
 const html=renderToStaticMarkup(<DeliveryPricingContent order={order}/>);assert.match(html,/All 5 delivery dates/);assert.match(html,/Unavailable/);assert.match(html,/Pending \/ unavailable/);
});
test('breakdown reads never invoke quoting, booking, payment or order mutations',()=>{
 const code=readFileSync(new URL('./MerchantDeliveryPricing.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(code,/storeDeliveryService|\.update\(|\.create\(|\.quote\(|\.dispatch\(/);
 assert.match(code,/storeOrderService.getOrder/);
});

test('legacy blocked re-quote fee is visible without inventing an ID or timestamp',()=>{
 const order=fixture();order.fulfilmentOperations={day0:{dispatch:{status:'dispatch_blocked_requote',requoteFee:20}}};
 const trip=deliveryPricingBreakdown(order)[0];assert.equal(trip.latestMinor,2000);assert.equal(trip.latestQuotationId,undefined);assert.equal(trip.latestQuotedAt,undefined);assert.equal(trip.protection,'Exceeds saved limit (estimate)');
});
test('POS raw daily quotations retain their saved ID without reusing a parent quote',()=>{
 const order=fixture();delete order.delivery.dayQuotes;order.posDeliveryPricing={dayQuotes:[{date:'2026-12-01',time:'11:00',quote:{fee:12.4,quotationId:'pos-day'}}]};
 assert.equal(deliveryPricingBreakdown(order)[1].quotationId,'pos-day');
});
