import test from 'node:test';
import assert from 'node:assert/strict';
import {deliveryOrderCase} from './fixtures/deliveryOrderCase.js';
import {canonicalFulfilmentMethod,canonicalFulfilmentView,resolveDeliveryDispatchData,normalizeDeliveryPhone} from './storeFulfilmentCanonical.js';

test('anonymized paid New delivery with pickup code and collection fields remains a delivery at its saved time/address',()=>{
 const order=deliveryOrderCase(), before=structuredClone(order), day=order.fulfilments[0];
 assert.equal(canonicalFulfilmentMethod(order,day),'delivery');
 assert.deepEqual(canonicalFulfilmentView(order,day),{method:'delivery',date:'2026-10-22',time:'11:30',address:order.delivery.recipient.address,locationName:''});
 const resolved=resolveDeliveryDispatchData(order,day);
 assert.deepEqual(resolved.issues,[]);assert.equal(resolved.recipient.phoneE164,'+60123456789');
 assert.equal(resolved.serviceType,'MOTORCYCLE');assert.deepEqual(order,before);
});
test('missing per-day destination safely uses the immutable recipient; different per-day address cannot borrow its coordinates',()=>{
 const order=deliveryOrderCase(), day=order.fulfilments[0];
 assert.equal(resolveDeliveryDispatchData(order,day).recipient.latitude,'3.11');
 day.destination={formattedAddress:'Different address without pin'};
 assert.deepEqual(resolveDeliveryDispatchData(order,day).issues.map(issue=>issue.field),['recipients[0].coordinates']);
});
test('compatibility can recover missing pins only from an exactly matching stored quotation address',()=>{
 const order=deliveryOrderCase();delete order.delivery.recipient.latitude;delete order.delivery.recipient.longitude;
 assert.deepEqual(resolveDeliveryDispatchData(order,order.fulfilments[0]).issues,[]);
 order.delivery.recipient.address='Unverified new address';
 assert.deepEqual(resolveDeliveryDispatchData(order,order.fulfilments[0]).issues.map(issue=>issue.field),['recipients[0].coordinates']);
});
test('a pickup code never determines method, and explicit per-day type/address/time override parent fields',()=>{
 const order=deliveryOrderCase(), day=order.fulfilments[0];
 order.fulfilmentMethod='pickup';assert.equal(canonicalFulfilmentMethod(order,day),'delivery');
 day.method='pickup';assert.equal(canonicalFulfilmentView(order,day).method,'pickup');
 delete day.method;delete order.fulfilmentMethod;assert.equal(canonicalFulfilmentMethod(order,day),'delivery');
});
test('missing contact/coordinates/service type are explicit blockers, never synthesized',()=>{
 const order=deliveryOrderCase();delete order.delivery.recipient.phoneE164;delete order.phone;delete order.delivery.pickup.contactName;delete order.delivery.quote.serviceType;
 const fields=resolveDeliveryDispatchData(order,order.fulfilments[0]).issues.map(issue=>issue.field);
 assert.deepEqual(fields,['serviceType','sender.name','recipients[0].phone']);
 assert.equal(normalizeDeliveryPhone('0123456789',''),'');assert.equal(normalizeDeliveryPhone('unknown','MY'),'');
 assert.equal(normalizeDeliveryPhone('+60123456789','MY'),'+60123456789');
});
