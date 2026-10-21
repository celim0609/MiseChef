import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import OrderFulfilmentDetails from './OrderFulfilmentDetails';
import {deliveryOrderCase} from '../../../functions/fixtures/deliveryOrderCase.js';
import {getOrderTickets,buildTicketDocument} from './orderTickets';
import {dailyEntries} from './dailyOrderModel';
import type {StoreOrder} from './types';

test('Store Orders, POS and kitchen tickets agree on the anonymized DV47 daily delivery record',()=>{
 const order=deliveryOrderCase() as unknown as StoreOrder;
 const html=renderToStaticMarkup(<dl><OrderFulfilmentDetails order={order} country="MY" /></dl>);
 assert.match(html,/Delivery Date/);assert.match(html,/Delivery Time/);assert.match(html,/Delivery Address/);assert.match(html,/11:30/);assert.match(html,/Unit 8, Example Building/);
 assert.doesNotMatch(html,/Pickup Date|Pickup Time|Pickup Location|Example Counter/);
 const ticket=getOrderTickets(order)[0];assert.equal(ticket.method,'delivery');assert.equal(ticket.address,order.delivery.recipient.address);assert.equal(ticket.date,'2026-10-22');assert.equal(ticket.time,'11:30');assert.equal(ticket.pickupCode,'ANON');
 const pos=dailyEntries([order],'Today','2026-10-22')[0];assert.equal(pos.ticket.address,ticket.address);assert.equal(pos.ticket.method,ticket.method);
 const kitchen=buildTicketDocument([ticket],'kitchen');assert.match(kitchen,/DELIVERY/);assert.match(kitchen,/Unit 8, Example Building/);assert.doesNotMatch(kitchen,/Example Counter/);
});
test('Pickup orders retain Pickup labels and their own location even with a delivery-like code',()=>{
 const order=deliveryOrderCase() as unknown as StoreOrder;order.fulfilmentMethod='pickup';order.fulfilments[0].method='pickup';order.pickupCode='DV47';
 const html=renderToStaticMarkup(<dl><OrderFulfilmentDetails order={order} country="MY" /></dl>);
 assert.match(html,/Pickup Date/);assert.match(html,/Pickup Time/);assert.match(html,/Pickup Location/);assert.match(html,/Example Counter/);assert.doesNotMatch(html,/Delivery Address/);
});
