import assert from 'node:assert/strict';
import test from 'node:test';
import {validateHistoryBackfillOptions} from './posHistoryBackfill.js';
import {verifyHistoryDeployment} from './posHistoryDeployment.js';
import {historyReadSource,historyIndexUnavailable} from './posHistoryReadPolicy.js';
const options={projectId:'misechef-fa4bf',candidate:'a'.repeat(40),execute:false,maxOrders:100,maxWrites:500,pageSize:25,maxRunMs:120000};
test('Production backfill defaults to read-only and execution requires project/SHA-bound confirmation and hard limits',()=>{
 assert.doesNotThrow(()=>validateHistoryBackfillOptions(options));
 assert.throws(()=>validateHistoryBackfillOptions({...options,execute:true}),/confirmation/);
 assert.throws(()=>validateHistoryBackfillOptions({...options,projectId:'other'}),/project/);
 assert.throws(()=>validateHistoryBackfillOptions({...options,maxWrites:10000}),/maxWrites/);
 assert.throws(()=>validateHistoryBackfillOptions({...options,pageSize:1000}),/pageSize/);
 assert.doesNotThrow(()=>validateHistoryBackfillOptions({...options,execute:true,confirmation:`BACKFILL POS HISTORY misechef-fa4bf ${options.candidate}`}));
});
test('initialization retains bounded legacy browsing and pins cursors to their original collection',()=>{
 assert.equal(historyReadSource(undefined),'legacy');
 assert.equal(historyReadSource({version:1,complete:false}),'legacy');
 assert.equal(historyReadSource({version:1,complete:true}),'index');
 assert.equal(historyReadSource({version:1,complete:true},'legacy'),'legacy');
 assert.equal(historyReadSource({version:1,complete:false},'index'),'index');
 assert.ok(historyIndexUnavailable({code:'failed-precondition',message:'The query requires an index'}));
 assert.ok(!historyIndexUnavailable({code:'permission-denied',message:'index not allowed'}));
});
test('backfill preflight permits only GET metadata and requires an active trigger plus both ready indexes',async()=>{
 const fields=[{fieldPath:'storeId',order:'ASCENDING'},{fieldPath:'workspaceId',order:'ASCENDING'}];
 const indexes=[{state:'READY',queryScope:'COLLECTION',fields:[...fields,{fieldPath:'date',order:'DESCENDING'}]},{state:'READY',queryScope:'COLLECTION',fields:[...fields,{fieldPath:'searchTerms',arrayConfig:'CONTAINS'},{fieldPath:'date',order:'DESCENDING'}]}];
 let state='ACTIVE';
 const request=async input=>{assert.equal(input.method,'GET');return {data:input.url.includes('cloudfunctions')?{state,eventTrigger:{eventType:'google.cloud.firestore.document.v1.written'}}:{indexes}};};
 await verifyHistoryDeployment({request,projectId:'misechef-fa4bf'});
 indexes[1].state='CREATING';await assert.rejects(verifyHistoryDeployment({request,projectId:'misechef-fa4bf'}),/READY/);
 indexes[1].state='READY';state='DEPLOYING';await assert.rejects(verifyHistoryDeployment({request,projectId:'misechef-fa4bf'}),/ACTIVE/);
});

test('projection transactions enforce mutation budgets before writing and remain a no-op on replay',async()=>{
 const {historyIndexRows,syncPosHistoryIndex}=await import('./posHistoryIndex.js');
 let order={storeId:'store',workspaceId:'workspace',orderNumber:'MC1',customerName:'QA',fulfilments:[{date:'2026-11-23'},{date:'2026-11-24'}]},saved=[],writes=0;
 const db={collection:name=>({doc:id=>({kind:'doc',name,id}),where:()=>({limit:n=>({kind:'query',n})})}),runTransaction:async callback=>callback({get:async ref=>ref.kind==='doc'?{exists:true,data:()=>order}:{size:saved.length,docs:saved},set:()=>writes++,delete:()=>writes++})};
 await assert.rejects(syncPosHistoryIndex(db,'id',{maxMutations:1}),error=>error.code==='history-write-budget');assert.equal(writes,0);
 assert.equal((await syncPosHistoryIndex(db,'id')).writes,2);assert.equal(writes,2);writes=0;
 saved=historyIndexRows(order,'id').map(row=>({id:`id__${row.date}`,data:()=>row,ref:{}}));
 assert.equal((await syncPosHistoryIndex(db,'id')).writes,0);assert.equal(writes,0);
 order={...order,fulfilments:Array.from({length:401},(_,i)=>({date:new Date(Date.UTC(2020,0,i+1)).toISOString().slice(0,10)}))};
 await assert.rejects(syncPosHistoryIndex(db,'id'),/safety bound/);assert.equal(writes,0);
});

test('initialization fallback stays pageable, detects index readiness, and never hides permission failures or mixes cursors',async()=>{
 const {withHistoryReadFallback}=await import('./posHistoryReadPolicy.js');
 let legacyCalls=0,indexCalls=0;
 const loadLegacy=async()=>{legacyCalls++;return {source:'legacy',hasMore:true,cursor:'legacy-cursor'};};
 const loadIndex=async()=>{indexCalls++;return {source:'index',cursor:'indexed-cursor'};};
 const request={readiness:undefined,hasCursor:false,loadLegacy,loadIndex};
 assert.equal((await withHistoryReadFallback(request)).cursor,'legacy-cursor');assert.equal(indexCalls,0);
 const ready={version:1,complete:true};
 assert.equal((await withHistoryReadFallback({...request,readiness:ready})).source,'index');
 assert.equal((await withHistoryReadFallback({...request,readiness:ready,hasCursor:true,cursorSource:'legacy'})).source,'legacy');
 const missing=async()=>{throw {code:'failed-precondition',message:'query requires an index'};};
 assert.equal((await withHistoryReadFallback({...request,readiness:ready,loadIndex:missing})).source,'legacy');
 await assert.rejects(withHistoryReadFallback({...request,readiness:ready,hasCursor:true,cursorSource:'index',loadIndex:missing}),error=>error.code==='failed-precondition');
 await assert.rejects(withHistoryReadFallback({...request,readiness:ready,loadIndex:async()=>{throw {code:'permission-denied'};}}),error=>error.code==='permission-denied');
 await assert.rejects(withHistoryReadFallback({...request,hasCursor:true,cursorSource:'index'}),/reinitializing/);
 assert.equal(legacyCalls,3);
});

test('backfill CLI rejects accidental execution and misspelled bounds before opening a database client',async()=>{
 const {spawnSync}=await import('node:child_process');
 const {fileURLToPath}=await import('node:url');
 const script=fileURLToPath(new URL('../scripts/backfillPosHistoryIndex.mjs',import.meta.url));
 for(const flags of [[],['--project=unexpected'],['--execute=false'],['--max-write=10'],['--project=misechef-fa4bf',`--candidate=${'a'.repeat(40)}`,'--execute','--confirm=WRONG']]){
  const result=spawnSync(process.execPath,[script,...flags],{encoding:'utf8',timeout:10000});
  assert.equal(result.status,1);assert.match(result.stderr,/supported project|Invalid value|Unknown or repeated|confirmation/);
 }
});
