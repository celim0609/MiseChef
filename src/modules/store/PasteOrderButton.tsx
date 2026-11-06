import {useRef,useState} from 'react';
import {httpsCallable} from 'firebase/functions';
import {functions} from '../../firebase';
import {getWeeklyDates} from '../../../functions/storeWeeklyMealPlan.js';
import {getDefaultStoreSetSelections} from './storeSetModel';
import type {ManualLine} from './manualPosPreview';
import type {StoreProduct,StoreSet} from './types';
export type PasteDraft={source:string;customerName:string;phone:string;notes:string;lines:ManualLine[];deliveryFeeOverride?:{amount:number;reason:string}};
type Line={key:string;name:string;quantity:number;date:string;time:string;method:string;address:string;notes:string;unitPrice:number|null;lineTotal:number|null;match:{id:string;kind:string}|null;issues:string[];choice?:string};
type Preview={customerName:string;phone:string;notes:string;paymentStatement:string;deliveryFee:number|null;warnings:string[];lines:Line[]};
export default function PasteOrderButton({workspaceId,storeId,slug,products,sets,onApply,disabled=false}:{workspaceId:string;storeId:string;slug:string;products:StoreProduct[];sets:StoreSet[];onApply:(draft:PasteDraft)=>void;disabled?:boolean}) {
 const [open,setOpen]=useState(false),[text,setText]=useState(''),[preview,setPreview]=useState<Preview|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[reviewed,setReviewed]=useState(false),[useFee,setUseFee]=useState(false);
 const inFlight=useRef(false);
 const change=(patch:Partial<Preview>)=>{setPreview(p=>p?{...p,...patch}:p);setReviewed(false);};
 const update=(i:number,patch:Partial<Line>)=>change({lines:preview!.lines.map((line,index)=>index===i?{...line,...patch}:line)});
 const extract=async()=>{
  if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');setReviewed(false);
  try{if(!functions)throw Error('Order extraction is unavailable.');const result=await httpsCallable<Record<string,string>,Preview>(functions,'extractStorePosPasteOrder',{timeout:60000})({workspaceId,storeId,slug,text});setPreview({...result.data,lines:result.data.lines.map(line=>({...line,choice:line.match?`${line.match.kind}:${line.match.id}`:''}))});}
  catch(e){setError(e instanceof Error?e.message:'Unable to extract. Enter the order manually.');}finally{inFlight.current=false;setBusy(false);}
 };
 const invalid=preview?.lines.some(line=>{
  if(!line.choice||!Number.isInteger(line.quantity)||line.quantity<1||!/^\d{4}-\d{2}-\d{2}$/.test(line.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(line.time)||!['pickup','delivery','store_delivery'].includes(line.method))return true;
  if(line.method!=='pickup'&&!line.address.trim())return true;
  const product=products.find(p=>line.choice===`product:${p.id}`);
  if(product?.productType==='weekly_meal_plan'&&getWeeklyDates(line.date).length!==5)return true;
  return line.choice==='custom'&&(!line.name.trim()||line.unitPrice===null||!Number.isFinite(line.unitPrice)||line.unitPrice<0);
 });
 const apply=()=>{
  if(!preview||invalid||!reviewed||!preview.customerName.trim())return;
  const lines:ManualLine[]=preview.lines.map(line=>{
   const product=products.find(p=>line.choice===`product:${p.id}`), set=sets.find(s=>line.choice===`set:${s.id}`);
   return {quantity:line.quantity,date:line.date,time:line.time,method:line.method==='pickup'?'pickup':'delivery',deliveryArrangement:line.method==='store_delivery'?'store':'customer',deliveryAddress:line.address,notes:line.notes,
    ...(line.choice==='custom'?{custom:{name:line.name,unitPrice:line.unitPrice!}}:{selection:product?{productId:product.id,selectedOptions:[]}:{setId:set!.id,selectedOptions:[],selectedSetItems:getDefaultStoreSetSelections(set!,products)}})};
  });
  onApply({source:'whatsapp',customerName:preview.customerName,phone:preview.phone,notes:preview.notes,lines,...(useFee&&preview.deliveryFee!==null&&lines.some(line=>line.deliveryArrangement==='store')?{deliveryFeeOverride:{amount:preview.deliveryFee,reason:'Customer-agreed pasted delivery fee reviewed by staff'}}:{})});
  setOpen(false);setPreview(null);setText('');setReviewed(false);setUseFee(false);
 };
 const field='block w-full rounded border border-slate-300 bg-white p-2 text-sm text-slate-950';
 return <>
  <button type="button" disabled={disabled||!slug} onClick={()=>{setOpen(true);setError('');}} className="rounded-lg border px-3 py-2 text-sm font-bold">Paste Order</button>
  {open&&<div className="fixed inset-0 z-[150] overflow-y-auto bg-black/60 p-3"><section role="dialog" aria-modal="true" aria-label="Paste WhatsApp order" className="mx-auto max-w-4xl rounded-xl bg-white p-4 text-slate-950">
   <h2 className="text-lg font-bold">Paste Order</h2>
   <label>WhatsApp order text<textarea className={field} rows={7} maxLength={12000} value={text} disabled={busy} onChange={e=>{setText(e.target.value);setPreview(null);setReviewed(false);}}/></label>
   <button type="button" disabled={busy||text.trim().length<3} onClick={()=>void extract()} className="my-2 rounded border px-3 py-2 font-bold">{busy?'Extracting…':'Extract Order'}</button>
   {error&&<p role="alert" className="text-red-700">{error}</p>}
   {preview&&<>
    <h3 className="font-bold">Editable preview · Pending Payment</h3>
    <p className="text-sm">Review every field against the message. Applying replaces the draft and opens the existing manual checkout. Payment is confirmed separately after receipt.</p>
    {preview.warnings.map((warning,index)=><p key={index} className="text-sm text-amber-800">{warning}</p>)}
    <div className="my-3 grid gap-2 sm:grid-cols-2"><label>Customer name<input className={field} maxLength={120} value={preview.customerName} onChange={e=>change({customerName:e.target.value})}/></label><label>Phone<input className={field} maxLength={40} value={preview.phone} onChange={e=>change({phone:e.target.value})}/></label></div>
    {preview.lines.map((line,i)=><fieldset key={line.key} className="my-3 grid gap-2 rounded border p-3 sm:grid-cols-2">
     <legend className="font-bold">{i+1}. {line.name}</legend>
     {line.issues.map((issue,index)=><p key={index} className="text-sm text-amber-800 sm:col-span-2">{issue}</p>)}
     <label>Catalog item<select className={field} value={line.choice||''} onChange={e=>update(i,{choice:e.target.value})}><option value="">Choose explicitly…</option>{products.map(p=><option key={`p${p.id}`} value={`product:${p.id}`}>{p.name}</option>)}{sets.map(s=><option key={`s${s.id}`} value={`set:${s.id}`}>{s.name} (Set)</option>)}<option value="custom">Create Custom Item</option></select></label>
     <label>Quantity<input className={field} type="number" min="1" max="10000" value={line.quantity||''} onChange={e=>update(i,{quantity:Number(e.target.value)})}/></label>
     {line.choice==='custom'&&<><label>Custom item name<input className={field} maxLength={120} value={line.name} onChange={e=>update(i,{name:e.target.value})}/></label><label>Custom unit price<input className={field} type="number" min="0" step="0.01" value={line.unitPrice??''} onChange={e=>update(i,{unitPrice:e.target.value===''?null:Number(e.target.value)})}/></label></>}
     <label>Date (Weekly Plans start Monday)<input className={field} type="date" value={line.date} onChange={e=>update(i,{date:e.target.value})}/></label><label>Exact time / reviewed deadline<input className={field} type="time" value={line.time} onChange={e=>update(i,{time:e.target.value})}/></label>
     <label>Fulfilment<select className={field} value={line.method} onChange={e=>update(i,{method:e.target.value})}><option value="">Choose…</option><option value="pickup">Pickup</option><option value="delivery">Customer-arranged delivery</option><option value="store_delivery">Store delivery</option></select></label>
     {line.method!=='pickup'&&<label>Address<textarea className={field} maxLength={500} value={line.address} onChange={e=>update(i,{address:e.target.value})}/></label>}
     <label>Packaging / deadline / item remarks<input className={field} maxLength={500} value={line.notes} onChange={e=>update(i,{notes:e.target.value})}/></label>
     <p className="text-xs">Pasted unit price: {line.unitPrice??'missing'} · pasted line total: {line.lineTotal??'missing'}. Catalog items use current catalog pricing.</p>
     <button type="button" onClick={()=>change({lines:preview.lines.filter((_,index)=>index!==i)})} className="text-sm underline">Remove item</button>
    </fieldset>)}
    <label>Order remarks<textarea className={field} maxLength={500} value={preview.notes} onChange={e=>change({notes:e.target.value})}/></label>
    <p className="my-2 text-sm">Payment statement from message: {preview.paymentStatement||'Not specified'} · Receipt has not been verified.</p>
    {preview.deliveryFee!==null&&<label className="my-2 block text-sm"><input type="checkbox" checked={useFee} onChange={e=>{setUseFee(e.target.checked);setReviewed(false);}}/> Preserve agreed delivery fee {preview.deliveryFee.toFixed(2)} for Store delivery (audited manual fee).</label>}
    <label className="my-3 block font-bold"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/> I reviewed all items, conflicts, schedules and fees against the message.</label>
    {invalid&&<p role="alert" className="text-sm text-red-700">Complete item choices, quantities, dates, times and delivery addresses. Weekly Plans require a Monday.</p>}
    <button type="button" disabled={busy||invalid||!reviewed||!preview.lines.length||!preview.customerName.trim()} onClick={apply} className="rounded bg-blue-700 px-4 py-2 font-bold text-white disabled:opacity-40">Apply to Order</button>
   </>}
   <button type="button" disabled={busy} onClick={()=>setOpen(false)} className="m-2 rounded border px-3 py-2">Close</button>
  </section></div>}
 </>;
}
