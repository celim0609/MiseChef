import React from 'react';
import type { GroupReviewDetail } from './services/groupDeliveryReviewService';
const money=(minor:number)=>`RM${(minor/100).toFixed(2)}`;
const when=(iso:string)=>new Date(iso).toLocaleString('en-MY',{timeZone:'Asia/Kuala_Lumpur'});
export default function GroupDeliveryReviewDetails({detail,pickupTime,setPickupTime,confirmed,setConfirmed,now,busy,onEstimate,onApprove}:{detail:GroupReviewDetail;pickupTime:string;setPickupTime:(v:string)=>void;confirmed:boolean;setConfirmed:(v:boolean)=>void;now:number;busy:boolean;onEstimate:()=>void;onApprove:()=>void}) {
  const approved=detail.group.status==='approved';
  const estimate=detail.estimate;
  const valid=Boolean(estimate?.valid&&Date.parse(estimate.expiresAt)>now);
  const live=detail.members.filter(m=>Date.parse(m.expiresAt)>now);
  const active=live.reduce((n,m)=>n+m.portions,0);
  return <div className="space-y-4 rounded-2xl border border-slate-300 bg-white p-5">
    <h3 className="text-xl font-black">{detail.group.date} · {detail.group.areaName}</h3>
    <p className="font-bold">{active} / {detail.group.target} active reserved portions / 有效预订午餐份数</p>
    <p>Reservation expiry / 预订截止：{detail.group.expiresAt?when(detail.group.expiresAt):'—'} MYT</p>
    <p>Kitchen pickup / 厨房取件：{detail.pickup?.address||'Configure Store kitchen pickup first / 请先设置店铺厨房取件地址'}</p>
    <p className="rounded bg-slate-100 p-3 text-sm">Private customer details — Owner/Manager only. / 顾客资料保密，仅供店主或经理审核。</p>
    {live.map((m,index)=><article key={m.id} className="rounded-xl border p-4"><strong>{index+1}. {m.name} · {m.portions} portion(s) / 份</strong><p>{m.address.formattedAddress}</p>{m.unit&&<p>{m.unit}</p>}<p>{m.phone}</p><ul className="mt-2 list-inside list-disc">{m.items.map((item,i)=><li key={i}>{item.quantity} × {item.name}{item.selectedMealOptions?.length?` · ${item.selectedMealOptions.map(o=>o.optionName).join(', ')}`:''}</li>)}</ul><p className="mt-2 text-sm">Expires / 截止：{when(m.expiresAt)} MYT</p></article>)}
    {!approved&&<><label className="block">Pickup time (MYT) / 取件时间<input type="time" aria-label="Group kitchen pickup time" value={pickupTime} disabled={busy} onChange={e=>setPickupTime(e.target.value)} className="ml-3 rounded border bg-white p-2" /></label><p className="text-sm">Quote only, up to 15 customer stops in the listed order. / 仅估算报价，按列表顺序最多15个顾客站点。</p><button type="button" disabled={busy||!active} onClick={onEstimate} className="rounded-xl border border-blue-600 px-4 py-3 font-bold text-blue-800">Get multi-stop estimate / 获取多站点估价</button></>}
    {estimate&&<div className="rounded-xl bg-blue-50 p-4"><strong>Estimated business delivery cost / 商家配送估价：{money(estimate.feeMinor)}</strong><p>Sandbox estimate · {estimate.route.length-1} customer stop(s) / 测试环境估价·{estimate.route.length-1}个顾客站点</p><p>Customers / 顾客：RM0</p><p>Quoted pickup / 报价取件：{when(estimate.scheduleAt)} MYT</p><p>Quote expiry / 报价截止：{when(estimate.expiresAt)} MYT</p><p>{valid?'Estimate available for review / 可审核此报价':'Refresh required before approval / 批准前需刷新报价'}</p><p className="mt-2 text-sm">Final delivery cost may change before booking. / 实际预约配送时费用可能变动。</p></div>}
    {!approved&&<><label className="flex items-start gap-3"><input type="checkbox" checked={confirmed} disabled={busy||!valid} onChange={e=>setConfirmed(e.target.checked)} className="mt-1" /><span>I explicitly approve free delivery and the business covering {estimate?money(estimate.feeMinor):'the reviewed cost'}. / 我明确批准免费配送，并由商家承担{estimate?money(estimate.feeMinor):'已审核费用'}。</span></label><button type="button" disabled={busy||!valid||!confirmed||active<detail.group.target} onClick={onApprove} className="rounded-xl bg-blue-700 px-5 py-3 font-black text-white disabled:opacity-50">Approve free delivery / 批准免费配送</button></>}
    <p className="text-sm">Approval does not initiate payment, confirm Store orders or book delivery. / 批准不会发起付款、确认店铺订单或预约配送。</p>
    <section aria-label="Approval history / 审批记录"><h4 className="font-black">Approval history / 审批记录</h4>{!detail.history.length&&<p>No approval recorded. / 暂无审批记录。</p>}{detail.history.map(h=><article key={h.id} className="mt-2 rounded border border-green-300 bg-green-50 p-3"><p>Free delivery approved / 免费配送已获批 · {when(h.approvedAt)} MYT</p><p>Approved by / 审批人：{h.approvedBy}</p><p>{h.approvedPortions} portions / 份 · {money(h.estimatedDeliveryCostMinor)} business estimate / 商家估价 · RM0 customer delivery / 顾客配送费</p></article>)}</section>
  </div>;
}
