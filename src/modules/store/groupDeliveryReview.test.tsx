import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import GroupDeliveryReviewDetails from './GroupDeliveryReviewDetails';
import GroupDeliveryProgress from './GroupDeliveryProgress';
const detail={group:{id:'g',date:'2026-11-03',areaId:'pakatan-bercham-raya',areaName:'Pakatan / Bercham Raya',status:'collecting',activePortions:10,target:10,expiresAt:'2026-11-03T02:00:00Z'},members:[{id:'m',name:'QA customer',phone:'QA phone',unit:'QA unit',portions:10,expiresAt:'2026-11-03T02:00:00Z',address:{formattedAddress:'Private QA address',latitude:4.64,longitude:101.14},items:[{name:'Lunch',quantity:10,portionsPerUnit:1}]}],pickup:{address:'Separate kitchen'},estimate:{id:'e',valid:true,feeMinor:1840,currency:'MYR',environment:'sandbox',expiresAt:'2026-11-01T00:01:00Z',serviceType:'MOTORCYCLE',scheduleAt:'2026-11-03T03:30:00Z',route:[{address:'Kitchen'},{address:'Customer'}]},history:[]};
const render=(changes={})=>renderToStaticMarkup(<GroupDeliveryReviewDetails detail={detail} pickupTime="11:30" setPickupTime={()=>{}} confirmed={false} setConfirmed={()=>{}} now={Date.parse('2026-11-01T00:00:00Z')} busy={false} onEstimate={()=>{}} onApprove={()=>{}} {...changes} />);
test('POS review shows private address, quantities, separate kitchen, sandbox business estimate and RM0 customer fee',()=>{
 const html=render();for(const label of ['Private QA address','Separate kitchen','10 × Lunch','RM18.40','Sandbox estimate','RM0','Approval history','审批记录','explicitly approve'])assert.ok(html.includes(label),label);
 assert.match(html,/<button[^>]*disabled=""[^>]*>Approve free delivery/);
 assert.doesNotMatch(render({confirmed:true}),/<button[^>]*disabled=""[^>]*>Approve free delivery/);
 assert.match(render({confirmed:true,now:Date.parse('2026-11-01T00:02:00Z')}),/<button[^>]*disabled=""[^>]*>Approve free delivery/);
});
test('approved public state remains unpaid and unconfirmed, and POS tab is role-gated independently of normal orders',()=>{
 const html=renderToStaticMarkup(<GroupDeliveryProgress progress={{available:true,status:'approved',joinedPortions:10}}/>);
 assert.match(html,/Free delivery approved/);assert.match(html,/order not confirmed/);
 const pos=readFileSync(new URL('./StorePosPage.tsx',import.meta.url),'utf8');assert.match(pos,/canReviewGroupDelivery &&/);assert.match(pos,/posSection === 'group-delivery' && canReviewGroupDelivery \? <GroupDeliveryReviewPanel/);assert.match(pos,/setPosSection\('orders'\); \}, \[storeId, workspaceId, canReviewGroupDelivery\]/);assert.match(pos,/GroupDeliveryReviewPanel storeId=\{storeId\} workspaceId=\{workspaceId\}/);
 const app=readFileSync(new URL('../../App.tsx',import.meta.url),'utf8');assert.match(app,/canReviewGroupDelivery=\{getStorePermissions\(currentWorkspaceRole\).manageStoreSettings\}/);
});
