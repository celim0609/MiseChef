import assert from 'node:assert/strict';
import test from 'node:test';
import {buildGroupDeliveryRoute} from './groupDeliveryReview.js';
import {GROUP_DELIVERY_PILOT} from './groupDelivery.js';
const store={delivery:{provider:'lalamove',market:'MY',environment:'sandbox',serviceType:'MOTORCYCLE',pickup:{address:'Separate kitchen',latitude:4.60,longitude:101.10}}};
const member={address:{formattedAddress:'Customer address',...GROUP_DELIVERY_PILOT.center},unit:'Floor 2'};
const args={store,members:[member,{...member,unit:'Floor 3'}],date:'2026-11-03',pickupTime:'11:30',environment:'sandbox',now:new Date('2026-11-01T00:00:00Z')};
test('multi-stop request uses Store kitchen and every reviewed customer, without route optimization or booking',()=>{
 const quote=buildGroupDeliveryRoute(args);
 assert.equal(quote.data.stops.length,3);assert.equal(quote.data.stops[0].coordinates.lat,'4.6');
 assert.equal(quote.data.stops[0].address,'Separate kitchen');assert.equal(quote.data.stops[1].address,'Customer address, Floor 2');
 assert.equal(quote.data.scheduleAt,'2026-11-03T03:30:00.000Z');assert.equal(quote.data.isRouteOptimized,false);
});
test('quote-only route rejects missing kitchen, Production provider, expired schedule and unsupported stop count',()=>{
 for(const change of [{store:{delivery:{...store.delivery,pickup:null}}},{environment:'production'},{members:[]},{members:Array(16).fill(member)},{pickupTime:'25:00'},{now:new Date('2026-11-04')}]) assert.throws(()=>buildGroupDeliveryRoute({...args,...change}));
 assert.equal(buildGroupDeliveryRoute({...args,members:Array(15).fill(member)}).data.stops.length,16);
});
