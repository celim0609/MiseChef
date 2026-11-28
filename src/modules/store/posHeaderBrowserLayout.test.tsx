import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as Icons from 'lucide-react';
import ts from 'typescript';
import UpcomingDateSelector from './UpcomingDateSelector';
const source=readFileSync(new URL('./StorePosPage.tsx',import.meta.url),'utf8');
const management=readFileSync(new URL('./OrderManagementActions.tsx',import.meta.url),'utf8');
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const header=source.slice(source.indexOf('      <header className={`pos-shared-header'),source.indexOf('      <nav aria-label="POS sections"'));
const browser=source.slice(source.indexOf('          <section className={`pos-order-browser'),source.indexOf('            <div className="mt-3 hidden grid-cols-6'))+'</section>';
function component(jsx:string,ctx:Record<string,unknown>){const module:any={};new Function('exports','React',...Object.keys(ctx),ts.transpileModule(`export default function View(){return ${jsx};}`,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText)(module,React,...Object.values(ctx));return module.default;}
const noop=()=>{};
export function renderHeaderBrowserPreview(overrides:Record<string,any>={}){
 const ctx={...Object.fromEntries(['ArrowLeft','Moon','Volume2','VolumeX','Search','ChevronLeft','ChevronRight'].map(key=>[key,(Icons as any)[key]])),workspaceName:'QA Workspace',onBack:noop,manualPanelOpen:false,isNightMode:false,audioBlocked:false,posSection:'orders',newOrderOpen:false,newOrderMenuRef:{current:null},setNewOrderOpen:noop,setPendingView:noop,openExternalOrder:noop,setPosSection:noop,setManualCreateRequest:noop,setIsNightMode:noop,toggleSound:noop,soundEnabled:true,notificationAction:<button aria-label="Store notifications" aria-haspopup="menu" title="Store notifications"><Icons.Bell size={18}/></button>,workspaceId:'s',storeId:'s',DeletedOrders:()=>null,browserPeriod:'History',browserMode:'Day',historyDateBasis:'created',historyDateKey:'2026-11-28',todayKey:'2026-11-28',setHistoryDateKey:noop,searchAllDates:false,allHistoryDates:false,browserPayment:'',browserMethod:'',historyFilter:'all',HISTORY_FILTERS:[{id:'all',label:'All'},{id:'completed',label:'Completed'},{id:'cancelled',label:'Cancelled'},{id:'paid',label:'Paid'},{id:'pending',label:'Pending Payment'}],historySearch:'',historyOrderCount:0,searchBusy:false,searchPage:{hasMore:false},searchError:'',UpcomingDateSelector,...overrides};
 const Header=component(header,ctx),Browser=component(browser,ctx);
 return renderToStaticMarkup(<><Header/><nav aria-label="POS sections"><button>POS Live</button><button aria-current="page">View Orders</button><button>Print Tickets</button><button>Pending payments (5)</button></nav><main><Browser/></main></>);
}
function handlers(text:string){const file=ts.createSourceFile('view.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),printer=ts.createPrinter(),values:string[]=[];function visit(n:ts.Node){if(ts.isJsxAttribute(n)&&['onChange','onClick'].includes(n.name.getText(file))){const value=printer.printNode(ts.EmitHint.Unspecified,n,file);if(!value.includes('showPicker'))values.push(value);}ts.forEachChild(n,visit);}visit(file);return values.sort().join('\n');}
test('header/browser refinement preserves all existing query, pricing, payment and delivery functions',()=>{
 assert.equal(hash(source.slice(source.indexOf('  const [orders'),source.indexOf('  const paymentClass'))),'c8a54bfe0f1c9a1d5b70c421ccea2e03640353037ddc539d001a2d92d9a96ad6');
 assert.equal(hash(source.slice(source.indexOf('      <div hidden={!externalOpen}>'))),'82c2f34c57a8a1d529bd182b326ab304a7aad52717e6f24946cded8468393b32');
});
test('browser date, period, search and filter handlers remain unchanged',()=>assert.equal(hash(handlers(browser)),'276bf09a4c086f25e81d004a3fa34b1ae1512ff64053b129cd8ebebb31f2f7bd'));
test('completed Manual Order, Pending Payments, date logic and existing CSS remain unchanged',()=>{
 for(const [file,expected] of Object.entries({"./ManualPosOrders.tsx":"e7cf3686505d08c7f563aad6eec78d91b3558f39e6e58574002942e2095fbd3f","./UpcomingDateSelector.tsx":"d97f1546b0455f5da1b05b8d1147963a9f6d92f7fe243eeaf9a62d41330dfc30","./orderBrowserModel.ts":"d9b090ed7da88648c57bc58a793203b84116ed951d1ce31badcec2041bb0a614","./services/posHistorySearchService.ts":"2adf9fe058c2caf3da42cdf3484f1258309f20755cc95fd7a379c557ce1dc9bb"}))assert.equal(hash(readFileSync(new URL(file,import.meta.url),'utf8')),expected,file);
 const css=readFileSync(new URL('./posRefinement.css',import.meta.url),'utf8');assert.equal(hash(css.slice(0,css.indexOf('\n/* Shared POS header and order-browser presentation only.'))),'d6b7e47de8ef81dcb2b1070633be562af0e68eac5ea4152bb5815fc3b9da3e1b');
});
test('header has a single POS heading, accessible icon controls and a contained New Order menu',()=>{
 const html=renderHeaderBrowserPreview({newOrderOpen:true});assert.equal((html.match(/<h1/g)||[]).length,1);assert.match(html,/>POS<\/h1>/);assert.match(html,/role="menu" aria-label="New Order"/);assert.equal((html.match(/role="menuitem"/g)||[]).length,2);assert.ok(!html.includes('pos-new-order-bar'));assert.match(html,/title="Switch to dark theme"/);assert.match(html,/title="Mute order alerts"/);
});
test('history exposes one date value and simple counts while preserving partial/loading/error warnings',()=>{
 const html=renderHeaderBrowserPreview({historyOrderCount:1,searchPage:{hasMore:true},searchBusy:true,searchError:'History is incomplete'});
 assert.equal((html.match(/<h2>Order History<\/h2>/g)||[]).length,1);assert.equal((html.match(/type="date"/g)||[]).length,1);for(const text of ['Previous date','Next date','Yesterday','1 order shown','Searching…','More orders may be available','History is incomplete','Try again'])assert.ok(html.includes(text),text);
 assert.ok(!/unique orders in loaded matches|End of matching query|Selected fulfilment period/.test(html));
});
test('Owner overflow remains absent for Manager/Staff and retains the original deleted-order load guard',()=>{
 const declaration=management.slice(management.indexOf('export function DeletedOrders'));
 const module:any={};let owner=false;
 new Function('exports','React','useAccess','useState','useRef',ts.transpileModule(declaration,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText)(module,React,()=>({owner,manager:!owner}),React.useState,React.useRef);
 const render=(compact=true)=>renderToStaticMarkup(React.createElement(module.DeletedOrders,{workspaceId:'s',storeId:'s',compact}));
 assert.equal(render(),'');owner=true;assert.match(render(),/aria-label="Owner options"/);assert.match(render(),/Deleted Orders · Owner only/);assert.ok(!render(false).includes('pos-owner-overflow'));
 assert.equal(hash(management.slice(0,management.indexOf('export function DeletedOrders'))),'630151a94c2219ae2d0f92f705586f56acfc56de46c6bd063ca176d59e8f56ca');
 assert.equal(hash(declaration.slice(declaration.indexOf(' const access='),declaration.indexOf(' const content='))),'44fc56aa719226b56e773a21ab804675c279421e22148807178f40bf57451725');
});
