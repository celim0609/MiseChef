import {useState} from 'react';
import {applyManualDiscount, calculatePromotionPricing} from '../../../functions/storePromotionPricing.js';
export type ManualDiscount = {type:'fixed_amount'|'percentage'; value:number; reason?:string};
export type DiscountItem = {lineTotal:number; quantity:number; productId?:string; productName?:string; itemType?:string; weeklyPriceSnapshot?:{discountAmount:number}};
export function previewPosDiscount(items:DiscountItem[], discount:ManualDiscount|undefined, authorized:boolean) {
  try {
    const pricing=applyManualDiscount({items, pricing:calculatePromotionPricing({items,excluded:true}), discount, authorized, uid:'preview', currency:'MYR'});
    return {amountMinor:Math.round(pricing.discountTotal*100), error:''};
  } catch(error) {return {amountMinor:0,error:error instanceof Error?error.message:'Review the discount.'};}
}
export default function ManualDiscountControl({value,onChange,items,authorized,disabled=false}:{
  value?:ManualDiscount; onChange:(value:ManualDiscount|undefined)=>void;items:DiscountItem[];authorized:boolean;disabled?:boolean;
}) {
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState<ManualDiscount>({type:'fixed_amount',value:0,reason:''});
  const [amount,setAmount]=useState('');
  if(!authorized)return null;
  const candidate={...draft,value:Number(amount)};
  const preview=previewPosDiscount(items,candidate,true);
  return <section aria-label="Manual discount" className="my-3 space-y-2 rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-950">
    {!editing ? <div className="flex flex-wrap items-center gap-2">
      {value && <span>Manual discount · {value.type==='percentage'?`${value.value}%`:`RM ${value.value.toFixed(2)}`}{value.reason?` · ${value.reason}`:''}</span>}
      <button type="button" disabled={disabled} className="min-h-11 rounded-lg border px-3 font-bold" onClick={()=>{setDraft(value || {type:'fixed_amount',value:0,reason:''});setAmount(value?String(value.value):'');setEditing(true);}}>{value?'Edit discount':'Apply Discount'}</button>
      {value && <button type="button" disabled={disabled} className="min-h-11 rounded-lg border px-3" onClick={()=>onChange(undefined)}>Remove discount</button>}
    </div> : <>
      <div className="flex flex-wrap gap-2">
        <label>Discount type<select aria-label="Discount type" disabled={disabled} value={draft.type} onChange={event=>setDraft({...draft,type:event.target.value as ManualDiscount['type']})} className="ml-2 rounded border p-2"><option value="fixed_amount">Fixed amount (RM)</option><option value="percentage">Percentage (%)</option></select></label>
        <label>Value<input aria-label="Discount value" type="number" step="0.01" min="0.01" max={draft.type==='percentage'?100:undefined} disabled={disabled} value={amount} onChange={event=>setAmount(event.target.value)} className="ml-2 w-28 rounded border p-2" /></label>
      </div>
      <label className="block">Reason (optional)<input aria-label="Discount reason" maxLength={240} value={draft.reason || ''} disabled={disabled} onChange={event=>setDraft({...draft,reason:event.target.value})} className="mt-1 w-full rounded border p-2" /></label>
      {amount && preview.error && <p role="alert">{preview.error}</p>}
      <div className="flex gap-2"><button type="button" disabled={disabled||!amount||Boolean(preview.error)} className="min-h-11 rounded-lg bg-blue-700 px-3 font-bold text-white disabled:opacity-40" onClick={()=>{onChange(candidate);setEditing(false);}}>Apply discount</button><button type="button" disabled={disabled} className="min-h-11 rounded-lg border px-3" onClick={()=>setEditing(false)}>Cancel</button></div>
    </>}
    <p className="text-xs text-slate-600">Applies to products only. Delivery fees stay separate. Cannot combine with promotions, Weekly Discounts or Set offers.</p>
  </section>;
}
