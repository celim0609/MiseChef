import {randomUUID} from 'node:crypto';
import {FieldPath} from 'firebase-admin/firestore';
import {syncPosHistoryIndex} from './posHistoryIndex.js';
export const HISTORY_PROJECTS = ['misechef-beta-fa4bf','misechef-fa4bf'];
export function validateHistoryBackfillOptions(options) {
  if (!HISTORY_PROJECTS.includes(options.projectId)) throw new Error('Choose an explicit supported project.');
  if (!/^[a-f0-9]{40}$/.test(options.candidate || '')) throw new Error('Supply the exact deployed candidate SHA.');
  for (const [name,min,max] of [['maxOrders',1,500],['maxWrites',10,2000],['pageSize',1,50],['maxRunMs',1000,240000]]) {
    if (!Number.isInteger(options[name]) || options[name]<min || options[name]>max) throw new Error(`Invalid ${name} bound.`);
  }
  if (options.execute && options.confirmation !== `BACKFILL POS HISTORY ${options.projectId} ${options.candidate}`) throw new Error('Exact project/candidate-bound backfill confirmation is required.');
}
// No canonical source writes. A crash between projection and checkpoint repeats
// one idempotent order rather than skipping it. Trigger must be ACTIVE first.
export async function runHistoryBackfill({db,options,now=()=>Date.now(),sync=syncPosHistoryIndex}) {
  validateHistoryBackfillOptions(options);
  const progressRef=db.doc('system/posHistoryIndexBackfill');
  const readyRef=db.doc('system/posHistoryIndex');
  if (!options.execute) {
    const progress=await progressRef.get();
    return {dryRun:true,projectId:options.projectId,checkpoint:progress.data()?.lastOrderId || '',bounds:{maxOrders:options.maxOrders,maxWrites:options.maxWrites,pageSize:options.pageSize}};
  }
  const owner=randomUUID(),started=now();
  const leaseMs=10*60*1000;
  const initial=await db.runTransaction(async tx=>{
    const progress=await tx.get(progressRef),ready=await tx.get(readyRef);
    const data=progress.data() || {};
    if (data.leaseOwner && data.leaseUntil>now()) throw new Error('Another history backfill holds the lease.');
    if (data.version && data.version!==1) throw new Error('Incompatible checkpoint version.');
    if (data.projectId && data.projectId!==options.projectId) throw new Error('Checkpoint project mismatch.');
    if (data.complete && !options.restart && ready.exists && ready.data()?.version===1 && ready.data()?.complete) return {done:true,writes:0,lastOrderId:data.lastOrderId||'',processed:data.processed||0};
    const lastOrderId=options.restart?'':data.lastOrderId||'';
    const processed=options.restart?0:data.processed||0;
    tx.set(progressRef,{version:1,projectId:options.projectId,candidate:options.candidate,lastOrderId,processed,complete:false,leaseOwner:owner,leaseUntil:now()+leaseMs,updatedAt:new Date(now()).toISOString()});
    let writes=1;
    if (options.restart || !ready.exists || ready.data().version!==1 || !ready.data().complete) {
      tx.set(readyRef,{version:1,complete:false,state:'initializing'});writes++;
    }
    return {done:false,writes,lastOrderId,processed};
  });
  if(initial.done) return {complete:true,processed:0,writes:0,lastOrderId:initial.lastOrderId};
  let writes=initial.writes,lastOrderId=initial.lastOrderId,processed=0,exhausted=false,reason='order-limit';
  try {
    outer: while(processed<options.maxOrders) {
      if(now()-started>=options.maxRunMs){reason='time-limit';break;}
      if(writes>=options.maxWrites-3){reason='write-limit';break;}
      const take=Math.min(options.pageSize,options.maxOrders-processed);
      let query=db.collection('storeOrders').select().orderBy(FieldPath.documentId()).limit(take+1);
      if(lastOrderId)query=query.startAfter(lastOrderId);
      const page=await query.get();
      const documents=page.docs.slice(0,take);
      for(const document of documents) {
        if(writes>=options.maxWrites-3){reason='write-limit';break outer;}
        if(now()-started>=options.maxRunMs){reason='time-limit';break outer;}
        // Reserve one checkpoint and two finalization writes before each order.
        const available=Math.max(0,Math.min(400,options.maxWrites-writes-3));
        let result;
        try {result=await sync(db,document.id,{maxMutations:available});}
        catch(error){if(error.code==='history-write-budget'){reason='write-limit';break outer;}throw error;}
        writes+=result.writes;
        lastOrderId=document.id;processed++;
        await db.runTransaction(async tx=>{
          const checkpoint=await tx.get(progressRef);
          if(checkpoint.data()?.leaseOwner!==owner)throw new Error('Backfill lease changed; stop and resume safely.');
          tx.update(progressRef,{lastOrderId,processed:initial.processed+processed,leaseUntil:now()+leaseMs,updatedAt:new Date(now()).toISOString()});
        });writes++;
      }
      if(page.size<=take){exhausted=true;reason='complete';break;}
    }
    await db.runTransaction(async tx=>{
      const checkpoint=await tx.get(progressRef);
      if(checkpoint.data()?.leaseOwner!==owner)throw new Error('Backfill lease changed during finalization.');
      tx.update(progressRef,{complete:exhausted,leaseOwner:'',leaseUntil:0,updatedAt:new Date(now()).toISOString()});
      if(exhausted)tx.set(readyRef,{version:1,complete:true,state:'ready',completedAt:new Date(now()).toISOString()});
    });writes+=exhausted?2:1;
    return {complete:exhausted,processed,writes,lastOrderId,reason};
  } catch(error) {
    // Do not move the checkpoint on failure. An interrupted projection is safe
    // to replay after this lease expires; source records remain untouched.
    throw new Error(`History backfill stopped at checkpoint ${lastOrderId || '(start)'}: ${error.message}`,{cause:error});
  }
}
