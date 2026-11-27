import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
const weekly=readFileSync(new URL('./WeeklyPosPaymentActions.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(weekly,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
const exportsObject:any={};
new Function('require','exports','React',compiled)((id:string)=>id==='react'?React:{storeOrderService:{}},exportsObject,React);
const Actions=exportsObject.default;
const base={id:'pending',orderNumber:'MC-123',currency:'MYR',total:17.90,payment:{status:'pending',amountMinor:1790},manualOrder:{revision:2}};
const render=(extra:any={},props:any={})=>renderToStaticMarkup(<Actions order={{...base,...extra}} slug="store" providers={[]} compact {...props}/>);
test('compact payment actions omit the repeated order summary and retain manual payment',()=>{
 const html=render();assert.ok(!html.includes('MC-123'));assert.ok(!html.includes('17.90'));assert.ok(!html.includes('Pending payment'));assert.match(html,/Manual Payment/);assert.match(html,/<details hidden=""/);
});
test('active Curlec retains retrieve action and expands cancellation and test information on request',()=>{
 const html=render({weeklyPosLink:{provider:'curlec'},payment:{...base.payment,curlecEnvironment:'test'}});
 assert.match(html,/Retrieve Payment Link/);assert.match(html,/Cancel Payment Link/);assert.match(html,/Curlec Test Mode/);
 assert.ok(!html.includes('>Manual Payment<'));assert.match(html,/<details(?![^>]*open)[^>]*class="pos-payment-options"/);
});
test('provider-specific generation safeguards remain present in compact and legacy presentation',()=>{
 const html=render({}, {providers:['curlec','stripe']});assert.match(html,/Payment provider/);assert.match(html,/Customer email for Curlec/);assert.match(html,/<button[^>]*disabled=""[^>]*>Generate Payment Link/);
 const legacy=render({}, {compact:false});assert.match(legacy,/MC-123/);assert.match(legacy,/MYR 17.90/);
 assert.ok(!render({payment:{...base.payment,status:'paid'}}).includes('>Manual Payment<'));
});
test('compact expanded manual confirmation uses RM display without changing order currency',()=>{
 const order=structuredClone(base),before=JSON.stringify(order);
 const html=renderToStaticMarkup(<Actions order={order} slug="store" providers={[]} compact initialWorkflow="manual"/>);assert.match(html,/I received RM 17.90/);assert.match(html,/Confirm Payment Received/);assert.equal(JSON.stringify(order),before);
});

test('WeeklyPosPaymentActions.tsx payment state, service calls and permission calculations remain byte-identical',()=>{
 const source=readFileSync(new URL('./WeeklyPosPaymentActions.tsx',import.meta.url),'utf8');
 assert.equal(createHash('sha256').update(source.slice(source.indexOf('  const [showManual'),source.indexOf('  const button ='))).digest('hex'),'92ddb50c700f495466b0e063324df928083c4dcae127c489709f3c44495acaf5');
});

test('ManualPosOrders.tsx payment state, service calls and permission calculations remain byte-identical',()=>{
 const source=readFileSync(new URL('./ManualPosOrders.tsx',import.meta.url),'utf8');
 assert.equal(createHash('sha256').update(source.slice(source.indexOf('  const [open'),source.indexOf('  const input ='))).digest('hex'),'0bbf0f1c85c427e1fcd4d573c507bd3263a7d800ce2c4a78da3df57a89acdbe3');
});
const manualSource=readFileSync(new URL('./ManualPosOrders.tsx',import.meta.url),'utf8');
const rowStart=manualSource.indexOf('      {refined && pending.length > 0');
const rowEnd=manualSource.indexOf('      </div>}\n      {!refined && paid.length',rowStart);
const rowModule:any={};
const rowCode=ts.transpileModule(`export default function Rows({pending,canManageWeeklyPayments=true}){const refined=true,weeklyStore={workspaceId:'s',slug:'s'},workspaceId='s',weeklyLinkProviders=[],busy=false;const load=()=>{},setSaved=()=>{},setPay=()=>{},setMethod=()=>{},setReceived=()=>{},setReference=()=>{},setError=()=>{};return <div>${manualSource.slice(rowStart,rowEnd)}</div>}`,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
new Function('exports','React','WeeklyPosPaymentActions',rowCode)(rowModule,React,Actions);
const Rows=rowModule.default;
test('pending row displays its number, amount and status once and retains all seven columns',()=>{
 const order={...base,customerName:'QA',weeklyDayPos:true,fulfilments:[{date:'2026-11-27',time:'12:00'}]};
 const before=JSON.stringify(order),html=renderToStaticMarkup(<Rows pending={[order]}/>);
 for(const label of ['Order Number','Customer','Fulfilment Date/Time','Payment Method','Amount','Status','Actions'])assert.ok(html.includes(label));
 assert.equal((html.match(/>MC-123</g)||[]).length,1);assert.equal((html.match(/RM 17\.90/g)||[]).length,1);assert.equal((html.match(/>Pending Payment</g)||[]).length,1);
 assert.match(html,/Manual Payment/);assert.match(html,/View details/);assert.match(html,/Edit before payment/);assert.equal(JSON.stringify(order),before);
});
test('weekly rows keep unauthorized payment and edit controls absent while retaining details',()=>{
 const html=renderToStaticMarkup(<Rows pending={[{...base,weeklyDayPos:true,weeklyPosLink:{provider:'curlec'}}]} canManageWeeklyPayments={false}/>);
 for(const action of ['Manual Payment','Confirm Payment','Retrieve Payment Link','Cancel Payment Link','Edit before payment'])assert.ok(!html.includes(action),action);
 assert.match(html,/View details/);
});

test('multi-day orders keep a compact first fulfilment with an additional-day count and full date tooltip',()=>{
 const fulfilments=Array.from({length:5},(_,i)=>({date:`2026-11-${23+i}`,time:'12:00'}));
 const html=renderToStaticMarkup(<Rows pending={[{...base,fulfilments}]}/>);
 assert.match(html,/\+4 more fulfilments/);assert.match(html,/title="2026-11-23 12:00.*2026-11-27 12:00"/);
});
