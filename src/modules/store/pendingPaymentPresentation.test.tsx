import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
const base={id:'pending',orderNumber:'MC-123',currency:'MYR',total:17.90,payment:{status:'pending',amountMinor:1790},manualOrder:{revision:2}};
const manualSource=readFileSync(new URL('./ManualPosOrders.tsx',import.meta.url),'utf8');
const rowStart=manualSource.indexOf('      {refined && pending.length > 0');
const rowEnd=manualSource.indexOf('      </div>}\n      {!refined && paid.length',rowStart);
const rowModule:any={};
const rowCode=ts.transpileModule(`export default function Rows({pending}){const refined=true,busy=false;const load=()=>{},setSaved=()=>{},setPay=()=>{},setMethod=()=>{},setReceived=()=>{},setReference=()=>{},setError=()=>{};return <div>${manualSource.slice(rowStart,rowEnd)}</div>}`,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
new Function('exports','React',rowCode)(rowModule,React);
const Rows=rowModule.default;
test('pending row displays its number, amount and status once and retains all seven columns',()=>{
 const order={...base,customerName:'QA',weeklyDayPos:true,fulfilments:[{date:'2026-11-27',time:'12:00'}]};
 const before=JSON.stringify(order),html=renderToStaticMarkup(<Rows pending={[order]}/>);
 for(const label of ['Order Number','Customer','Fulfilment Date/Time','Payment Method','Amount','Status','Actions'])assert.ok(html.includes(label));
 assert.equal((html.match(/>MC-123</g)||[]).length,1);assert.equal((html.match(/RM 17\.90/g)||[]).length,1);assert.equal((html.match(/>Pending Payment</g)||[]).length,1);
 assert.match(html,/Confirm Payment/);assert.match(html,/View details/);assert.match(html,/Edit before payment/);assert.equal(JSON.stringify(order),before);
});
test('multi-day orders keep a compact first fulfilment with an additional-day count and full date tooltip',()=>{
 const fulfilments=Array.from({length:5},(_,i)=>({date:`2026-11-${23+i}`,time:'12:00'}));
 const html=renderToStaticMarkup(<Rows pending={[{...base,fulfilments}]}/>);
 assert.match(html,/\+4 more fulfilments/);assert.match(html,/title="2026-11-23 12:00.*2026-11-27 12:00"/);
});
