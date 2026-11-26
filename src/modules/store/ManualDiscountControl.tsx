import {useState} from 'react';
import {calculatePosPricing, posPricingExpectation} from '../../../functions/storePromotionPricing.js';
export type ManualDiscount = {type:'fixed_amount'|'percentage'; value:number; reason?:string;application?:'keep'|'replace'|'stack'};
export type DiscountItem = {lineTotal:number; quantity:number; productId?:string; productName?:string; basePrice?:number; itemType?:string; weeklyPriceSnapshot?:{discountAmount:number}};
export function previewPosDiscount(items:DiscountItem[], discount:ManualDiscount|undefined, authorized:boolean, promotions:import('./types').StorePromotion[]=[], now=new Date()) {
  const price=(manual?:ManualDiscount)=>calculatePosPricing({items,promotions,discount:manual,authorized,uid:'preview',currency:'MYR',now});
  const automatic=price();
  try {
    const pricing=price(discount);
    return {amountMinor:Math.round(pricing.discountTotal*100),manualAmountMinor:Math.round((pricing.manualDiscountTotal || 0)*100),automaticAmountMinor:Math.round((pricing.automaticDiscountTotal || 0)*100),offeredAutomaticMinor:Math.round(automatic.discountTotal*100),pricing,automaticPricing:automatic,expectation:posPricingExpectation(pricing),error:''};
  } catch(error) {return {amountMinor:Math.round(automatic.discountTotal*100),manualAmountMinor:0,automaticAmountMinor:Math.round(automatic.discountTotal*100),offeredAutomaticMinor:Math.round(automatic.discountTotal*100),pricing:automatic,automaticPricing:automatic,expectation:posPricingExpectation(automatic),error:error instanceof Error?error.message:'Review the discount.'};}
}
export default function ManualDiscountControl({value,onChange,items,authorized,disabled=false,promotions=[],now=new Date()}:{
  value?:ManualDiscount; onChange:(value:ManualDiscount|undefined)=>void;items:DiscountItem[];authorized:boolean;disabled?:boolean;promotions?:import('./types').StorePromotion[];now?:Date;
}) {
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState<ManualDiscount>({type:'fixed_amount',value:0,reason:''});
  const [amount,setAmount]=useState('');
  if(!authorized)return null;
  const offered=previewPosDiscount(items,undefined,true,promotions,now).offeredAutomaticMinor;
  const candidate={...draft,value:Number(amount)};
  const preview=previewPosDiscount(items,candidate,true,promotions,now);
  return <section aria-label="Manual discount" className="my-3 space-y-2 rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-950">
    {!editing ? <div className="flex flex-wrap items-center gap-2">
      {value && <span>Manual discount · {value.type==='percentage'?`${value.value}%`:`RM ${value.value.toFixed(2)}`}{value.reason?` · ${value.reason}`:''}</span>}
      <button type="button" disabled={disabled} className="min-h-11 rounded-lg border px-3 font-bold" onClick={()=>{setDraft(value ? {...value,application:value.application || (offered>0?'keep':undefined)} : {type:'fixed_amount',value:0,reason:'',...(offered>0?{application:'keep' as const}:{})});setAmount(value?String(value.value):'');setEditing(true);}}>{value?'Edit discount':'Apply Discount'}</button>
      {value && <button type="button" disabled={disabled} className="min-h-11 rounded-lg border px-3" onClick={()=>onChange(undefined)}>Remove discount</button>}
    </div> : <>
      {offered>0 && <label className="block">Automatic promotions<select aria-label="Automatic promotion choice" disabled={disabled} value={draft.application || 'keep'} onChange={event=>setDraft({...draft,application:event.target.value as ManualDiscount['application']})} className="ml-2 rounded border p-2"><option value="keep">Keep automatic promotions (no manual discount)</option><option value="replace">Replace automatic promotions with manual discount</option><option value="stack">Stack manual discount after automatic promotions</option></select></label>}

      <div className="flex flex-wrap gap-2">
        <label>Discount type<select aria-label="Discount type" disabled={disabled} value={draft.type} onChange={event=>setDraft({...draft,type:event.target.value as ManualDiscount['type']})} className="ml-2 rounded border p-2"><option value="fixed_amount">Fixed amount (RM)</option><option value="percentage">Percentage (%)</option></select></label>
        <label>Value<input aria-label="Discount value" type="number" step="0.01" min="0.01" max={draft.type==='percentage'?100:undefined} disabled={disabled} value={amount} onChange={event=>setAmount(event.target.value)} className="ml-2 w-28 rounded border p-2" /></label>
      </div>
      <label className="block">Reason (optional)<input aria-label="Discount reason" maxLength={240} value={draft.reason || ''} disabled={disabled} onChange={event=>setDraft({...draft,reason:event.target.value})} className="mt-1 w-full rounded border p-2" /></label>
      {amount && draft.application!=='keep' && preview.error && <p role="alert">{preview.error}</p>}
      <div className="flex gap-2"><button type="button" disabled={disabled||(draft.application!=='keep'&&(!amount||Boolean(preview.error)))} className="min-h-11 rounded-lg bg-blue-700 px-3 font-bold text-white disabled:opacity-40" onClick={()=>{onChange(draft.application==='keep'?undefined:candidate);setEditing(false);}}>Apply discount</button><button type="button" disabled={disabled} className="min-h-11 rounded-lg border px-3" onClick={()=>setEditing(false)}>Cancel</button></div>
    </>}
    <p className="text-xs text-slate-600">Applies to products only. Delivery fees stay separate. Automatic promotions require an explicit keep, replace or stack choice. Stacked percentages use the remaining eligible product subtotal. Weekly Discounts and Set offers are protected.</p>
  </section>;
}
