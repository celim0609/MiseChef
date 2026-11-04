import {useEffect,useRef,useState} from 'react';
import {doc,getDoc} from 'firebase/firestore';
import {httpsCallable} from 'firebase/functions';
import {auth,db,functions} from '../../firebase';
import type {StoreOrder} from './types';
const permissions=new Map<string,Promise<{owner:boolean;manager:boolean}>>();
function useAccess(workspaceId:string){
 const [access,setAccess]=useState({owner:false,manager:false});
 useEffect(()=>{
  let active=true;const uid=auth?.currentUser?.uid;
  if(!db||!uid)return;
  const key=`${workspaceId}:${uid}`;
  if(!permissions.has(key))permissions.set(key,Promise.all([getDoc(doc(db,'workspaces',workspaceId)),getDoc(doc(db,'workspaceMembers',`${workspaceId}_${uid}`))]).then(([w,m])=>{const member=m.data(),valid=member?.userId===uid&&member?.workspaceId===workspaceId&&member?.status==='Active';return{owner:w.data()?.ownerId===uid||Boolean(valid&&member?.role==='Owner'),manager:Boolean(valid&&member?.role==='Manager')};}).catch(()=>({owner:false,manager:false})));
  void permissions.get(key)!.then(result=>{if(active)setAccess(result);});return()=>{active=false;};
 },[workspaceId]);return access;
}
export default function OrderManagementActions({order,onChanged}:{order:StoreOrder;onChanged?:()=>void}){
 const access=useAccess(order.workspaceId),[action,setAction]=useState<'cancel'|'delete'|null>(null),[reason,setReason]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);const inFlight=useRef(false);
 const allowed=access.owner||access.manager;
 if(!allowed||order.deletedAt||order.groupOrder)return null;
 const submit=async()=>{
  if(inFlight.current||!reason.trim()||!action)return;inFlight.current=true;setBusy(true);setError('');
  try{if(!functions)throw Error('Order management unavailable.');await httpsCallable(functions,'manageStorePosOrder')({orderId:order.id,action,reason});setAction(null);setReason('');onChanged?.();}catch(e){setError(e instanceof Error?e.message:'Unable to update the order.');}finally{inFlight.current=false;setBusy(false);}
 };
 return <>
  <details className="mt-2"><summary className="cursor-pointer rounded border px-3 py-2 text-sm font-bold">More Actions</summary>
   {!['Completed','Cancelled'].includes(order.fulfilmentStatus)&&<button type="button" onClick={()=>{setAction('cancel');setReason('');setError('');}} className="m-1 rounded border px-3 py-2 text-sm">Cancel Order</button>}
   {(access.owner||order.payment.status!=='paid')&&<button type="button" onClick={()=>{setAction('delete');setReason('');setError('');}} className="m-1 rounded border border-red-300 px-3 py-2 text-sm text-red-700">Delete Order</button>}
  </details>
  {action&&<div className="fixed inset-0 z-[160] flex items-center justify-center overflow-y-auto bg-black/60 p-3"><section role="dialog" aria-modal="true" aria-label={action==='delete'?'Delete order confirmation':'Cancel order confirmation'} className="w-full max-w-lg rounded-xl bg-white p-5 text-slate-950">
   <h3 className="text-lg font-bold">{action==='delete'?'Delete':'Cancel'} {order.orderNumber}?</h3>
   <p className="my-2 text-sm">{action==='delete'?'This hides the order from operational queues and retains its financial and audit records.':'This cancels fulfilment and retains the order in history.'} Payments are not refunded and external delivery bookings are not cancelled by this action.</p>
   <label className="block text-sm font-bold">Reason<textarea className="my-2 block w-full rounded border p-2" maxLength={240} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></label>
   {error&&<p role="alert" className="text-red-700">{error}</p>}
   <button type="button" disabled={busy||!reason.trim()} onClick={()=>void submit()} className="mr-2 rounded bg-red-700 px-4 py-2 font-bold text-white disabled:opacity-40">{busy?'Saving…':action==='delete'?'Confirm Delete':'Confirm Cancel'}</button>
   <button type="button" disabled={busy} onClick={()=>setAction(null)} className="rounded border px-4 py-2">Keep Order</button>
  </section></div>}
 </>;
}
export function DeletedOrders({workspaceId,storeId}:{workspaceId:string;storeId:string}){
 const access=useAccess(workspaceId),[orders,setOrders]=useState<StoreOrder[]>([]),[cursor,setCursor]=useState<{date:string;id:string}|null>(null),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');const inFlight=useRef(false);
 const load=async(more=false)=>{if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');try{if(!functions)throw Error('Order history unavailable.');const result=await httpsCallable<unknown,{orders:StoreOrder[];cursor:{date:string;id:string}|null}>(functions,'listDeletedStorePosOrders')({workspaceId,storeId,...(more&&cursor?{cursor}:{})});setOrders(old=>more?[...old,...result.data.orders]:result.data.orders);setCursor(result.data.cursor);setLoaded(true);}catch(e){setError(e instanceof Error?e.message:'Unable to load deleted orders.');}finally{setBusy(false);inFlight.current=false;}};
 if(!access.owner)return null;
 return <details className="my-3 rounded-xl border bg-white p-3 text-slate-950"><summary className="cursor-pointer font-bold" onClick={()=>{if(!loaded)void load();}}>Deleted Orders · Owner only</summary>
  <button type="button" disabled={busy} onClick={()=>void load()} className="my-2 rounded border px-3 py-2 text-sm">{busy?'Loading…':'Refresh'}</button>{error&&<p role="alert" className="text-red-700">{error}</p>}
  {orders.map(order=><details key={order.id} className="my-2 rounded border p-3"><summary className="cursor-pointer text-sm font-bold">Deleted · {order.orderNumber} · {order.customerName} · {order.payment.status} · {order.currency} {order.total.toFixed(2)}</summary><p className="text-sm">Deleted {order.deletedAt} · {order.deletionReason}</p><p className="text-sm">Original fulfilment: {order.fulfilmentStatus}</p>{order.items.map((item,i)=><p className="text-sm" key={i}>{item.quantity} × {item.productName}</p>)}</details>)}
  {loaded&&!orders.length&&<p className="text-sm">No deleted orders.</p>}{cursor&&<button type="button" disabled={busy} onClick={()=>void load(true)} className="rounded border px-3 py-2">Load older deleted orders</button>}
 </details>;
}
