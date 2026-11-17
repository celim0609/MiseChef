import {HttpsError} from 'firebase-functions/v2/https';
import {FieldValue,FieldPath} from 'firebase-admin/firestore';
import {assertOperator} from './externalPosOrders.js';
const id=value=>typeof value==='string'&&/^[\w-]{1,150}$/.test(value)?value:'';
const deny=()=>{throw new HttpsError('permission-denied','Your role cannot perform this order action.');};
export async function managePosOrder({db,uid,input,now=new Date()}) {
 if(!uid)throw new HttpsError('unauthenticated','Sign in to manage orders.');
 if(!id(input?.orderId)||!['delete','cancel'].includes(input?.action))throw new HttpsError('invalid-argument','Choose an order and action.');
 const reason=typeof input.reason==='string'?input.reason.trim():'';
 if(!reason||reason.length>240)throw new HttpsError('invalid-argument','Enter a reason of 1–240 characters.');
 const ref=db.collection('storeOrders').doc(input.orderId);
 return db.runTransaction(async tx=>{
  const snapshot=await tx.get(ref),order=snapshot.data();
  if(!order)throw new HttpsError('not-found','Order not found.');
  const owner=await assertOperator({db,uid,workspaceId:order.workspaceId,financial:true,transaction:tx});
  if(order.groupOrder||order.groupDelivery)throw new HttpsError('failed-precondition','Manage grouped delivery orders through their existing workflow.');
  if(input.action==='delete'&&!owner&&order.payment?.status==='paid')deny();
  if(order.deletedAt){if(input.action==='delete')return{duplicate:true,orderId:ref.id};throw new HttpsError('failed-precondition','This order has been deleted.');}
  if(input.action==='cancel'&&order.fulfilmentStatus==='Completed')throw new HttpsError('failed-precondition','Completed orders retain their financial completion. Use the existing refund workflow when required, or soft-delete to hide the order.');
  if(input.action==='cancel'&&order.fulfilmentStatus==='Cancelled')return{duplicate:true,orderId:ref.id};
  const at=now.toISOString();
  if(input.action==='delete'){
   tx.update(ref,{deletedAt:at,deletedBy:uid,deletionReason:reason,updatedAt:at});
   tx.create(db.collection('stores').doc(order.storeId).collection('deletedOrders').doc(ref.id),{orderId:ref.id,workspaceId:order.workspaceId,storeId:order.storeId,deletedAt:at});
  } else tx.update(ref,{fulfilmentStatus:'Cancelled',previousFulfilmentStatus:order.fulfilmentStatus,cancellationReason:reason,cancelledAt:at,cancelledBy:uid,fulfilmentUpdatedAt:at,fulfilmentUpdatedBy:uid,updatedAt:at});
  // Payment/refund/provider documents are deliberately untouched.
  tx.create(db.collection('storeOrderTimeline').doc(),{orderId:ref.id,workspaceId:order.workspaceId,storeId:order.storeId,type:input.action==='delete'?'order_deleted':'fulfilment_status',label:input.action==='delete'?'Order soft-deleted':'Order cancelled',actingUserId:uid,reason,previousStatus:order.fulfilmentStatus,paymentStatus:order.payment?.status||'',createdAt:FieldValue.serverTimestamp()});
  return{orderId:ref.id,duplicate:false};
 });
}
export async function listDeletedPosOrders({db,uid,input}) {
 if(!uid)throw new HttpsError('unauthenticated','Sign in to view deleted orders.');
 if(!id(input?.storeId)||!id(input?.workspaceId))throw new HttpsError('invalid-argument','Choose a Store.');
 const store=(await db.collection('stores').doc(input.storeId).get()).data();
 if(!store||store.workspaceId!==input.workspaceId)deny();
 const owner=await assertOperator({db,uid,workspaceId:input.workspaceId,financial:true});if(!owner)deny();
 let query=db.collection('stores').doc(input.storeId).collection('deletedOrders').orderBy('deletedAt','desc').orderBy(FieldPath.documentId(),'desc').limit(51);
 if(input.cursor){if(typeof input.cursor.date!=='string'||!id(input.cursor.id))throw new HttpsError('invalid-argument','Invalid cursor.');query=query.startAfter(input.cursor.date,input.cursor.id);}
 const snapshot=await query.get(),page=snapshot.docs.slice(0,50);
 const orders=await Promise.all(page.map(async doc=>(await db.collection('storeOrders').doc(doc.data().orderId).get()).data()));
 const last=page.at(-1)?.data();
 return{orders:orders.filter(order=>order?.deletedAt&&order.workspaceId===input.workspaceId&&order.storeId===input.storeId),cursor:snapshot.docs.length>50?{date:last.deletedAt,id:last.orderId}:null};
}
