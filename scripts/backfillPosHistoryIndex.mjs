import {initializeApp, applicationDefault} from '../functions/node_modules/firebase-admin/lib/esm/app/index.js';
import {getFirestore, FieldPath} from '../functions/node_modules/firebase-admin/lib/esm/firestore/index.js';
import {syncPosHistoryIndex} from '../functions/posHistoryIndex.js';
// Deliberately Beta-only. Re-runnable; reads and writes one bounded batch at a time.
const projectId = 'misechef-beta-fa4bf';
if (!process.argv.includes('--beta')) throw new Error('Pass --beta to build the Beta search projection.');
initializeApp({credential:applicationDefault(),projectId});
const db=getFirestore();
let cursor=null, count=0;
while (true) {
 let query=db.collection('storeOrders').orderBy(FieldPath.documentId()).limit(50);
 if(cursor) query=query.startAfter(cursor);
 const page=await query.get();
 if(page.empty) break;
 for(const order of page.docs) {await syncPosHistoryIndex(db,order.id);count++;}
 cursor=page.docs.at(-1);
 console.log(`Indexed ${count} orders`);
}
await db.doc('system/posHistoryIndex').set({version:1,complete:true,completedAt:new Date().toISOString(),orders:count});
console.log(`Beta history search ready: ${count} orders`);
