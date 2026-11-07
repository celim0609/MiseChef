import React, { useCallback, useEffect, useRef, useState } from 'react';
import { groupDeliveryReviewService as api, type GroupReviewDetail, type GroupReviewSummary } from './services/groupDeliveryReviewService';
import GroupDeliveryReviewDetails from './GroupDeliveryReviewDetails';
const message=(e:unknown)=>e instanceof Error?e.message:'Please retry. / 请重试。';
export default function GroupDeliveryReviewPanel({storeId,workspaceId}:{storeId:string;workspaceId:string}) {
  const [groups,setGroups]=useState<GroupReviewSummary[]>([]),[detail,setDetail]=useState<GroupReviewDetail>();
  const [areaId, setAreaId] = useState('');
  const [areas, setAreas] = useState<Array<{areaId: string; areaName: string}>>([]);
  const [date,setDate]=useState(''),[cursor,setCursor]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const [pickupTime,setPickupTime]=useState('11:30'),[confirmed,setConfirmed]=useState(false),[now,setNow]=useState(Date.now());
  const generation=useRef(0),approvalRequest=useRef(crypto.randomUUID());
  const refresh=useCallback(async()=>{const request=++generation.current;setBusy(true);setError('');setDetail(undefined);setGroups([]);setConfirmed(false);try{const result=await api.list(storeId,workspaceId,date,'',areaId);if(request===generation.current){setGroups(result.groups);setAreas(result.areas);setCursor(result.cursor);setDetail(undefined);setConfirmed(false);}}catch(e){if(request===generation.current)setError(message(e));}finally{if(request===generation.current)setBusy(false);}},[storeId,workspaceId,date,areaId]);
  useEffect(()=>{void refresh();return()=>{generation.current++;};},[refresh]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  useEffect(()=>{
    if(busy)return;
    let live=true;
    const timer=setInterval(async()=>{try{
      const rows=await api.list(storeId,workspaceId,date,'',areaId);
      if(!live)return;
      setGroups(old=>{const updates=new Map(rows.groups.map(g=>[g.id,g]));return old.length>rows.groups.length?old.map(g=>updates.get(g.id)||g):rows.groups;});
      if(detail?.group.id){const updated=await api.detail(storeId,workspaceId,detail.group.id);if(!live)return;setDetail(updated);if(!updated.estimate?.valid||updated.estimate?.id!==detail.estimate?.id)setConfirmed(false);}
    }catch(e){if(live){setDetail(undefined);setGroups([]);setConfirmed(false);setError(message(e));}}},30000);
    return()=>{live=false;clearInterval(timer);};
  },[storeId,workspaceId,date,areaId,detail?.group.id,busy]);

  const select=async(id:string)=>{const request=++generation.current;setBusy(true);setError('');setNotice('');setDetail(undefined);setConfirmed(false);approvalRequest.current=crypto.randomUUID();try{const result=await api.detail(storeId,workspaceId,id);if(request===generation.current)setDetail(result);}catch(e){if(request===generation.current)setError(message(e));}finally{if(request===generation.current)setBusy(false);}};
  const estimate=async()=>{if(!detail)return;setBusy(true);setError('');setNotice('');setConfirmed(false);try{await api.estimate(storeId,workspaceId,detail.group.id,pickupTime);setDetail(await api.detail(storeId,workspaceId,detail.group.id));approvalRequest.current=crypto.randomUUID();}catch(e){setError(message(e));}finally{setBusy(false);}};
  const approve=async()=>{if(!detail?.estimate||!confirmed||busy)return;setBusy(true);setError('');try{const result=await api.approve(storeId,workspaceId,detail.group.id,detail.estimate,approvalRequest.current);setNotice(result.duplicate?'Already approved; no duplicate approval recorded. / 已获批，未重复记录。':'Free delivery approved. No payment, confirmed order or booking was created. / 免费配送已获批；尚未发起付款、确认订单或预约配送。');const updated=await api.detail(storeId,workspaceId,detail.group.id);setDetail(updated);setGroups(old=>old.map(g=>g.id===updated.group.id?updated.group:g));setConfirmed(false);}catch(e){setError(message(e));setConfirmed(false);}finally{setBusy(false);}};
  return <main className="space-y-5 p-4 text-slate-950 lg:p-6">
    <h2 className="text-xl font-black">Group Delivery review / 团购配送审核</h2>
    <div className="flex flex-wrap items-end gap-3"><label>Delivery date / 配送日期<input aria-label="Group delivery review date" type="date" value={date} disabled={busy} onChange={e=>setDate(e.target.value)} className="ml-3 rounded border bg-white p-2" /></label><label>Area / 区域<select value={areaId} disabled={busy} onChange={e=>setAreaId(e.target.value)} className="ml-3 rounded border bg-white p-2"><option value="">All areas</option>{areas.map(area=><option key={area.areaId} value={area.areaId}>{area.areaName}</option>)}</select></label><button disabled={busy} onClick={()=>void refresh()} className="rounded border bg-white px-4 py-2 font-bold">Refresh / 刷新</button></div>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}{notice&&<p role="status" className="rounded-xl bg-green-50 p-4 text-green-900">{notice}</p>}
    <div className="grid gap-5 xl:grid-cols-[minmax(260px,1fr)_minmax(0,2fr)]"><section aria-label="Groups by date and area" className="space-y-2">
      {!groups.length&&!busy&&<p>No groups for this date. / 此日期暂无团购。</p>}
      {groups.map(g=><button type="button" key={g.id} disabled={busy} aria-pressed={detail?.group.id===g.id} onClick={()=>void select(g.id)} className={`block w-full rounded-lg border p-3 text-left ${detail?.group.id===g.id?'border-blue-600 bg-blue-50':'border-slate-300 bg-white'}`}><strong>{g.date} · {g.areaName}</strong><span className="mt-2 block">{g.activePortions} / {g.target} paid portions / 已付款午餐份数</span><span className="block">{g.status==='approved'?'Approved / 已获批':g.activePortions>=g.target?'Ready for review / 等待审核':Date.parse(g.expiresAt)<=now?'Cutoff passed / 已截止':'Collecting / 收集中'}</span><span className="block text-sm">Expiry / 截止：{g.expiresAt?new Date(g.expiresAt).toLocaleString('en-MY',{timeZone:'Asia/Kuala_Lumpur'}):'—'} MYT</span></button>)}
      {cursor&&<button disabled={busy} className="underline" onClick={async()=>{setBusy(true);try{const r=await api.list(storeId,workspaceId,date,cursor,areaId);setGroups(old=>[...old,...r.groups]);setCursor(r.cursor);}catch(e){setError(message(e));}finally{setBusy(false);}}}>Load more / 加载更多</button>}
    </section><section>{detail?<GroupDeliveryReviewDetails detail={detail} pickupTime={pickupTime} setPickupTime={value=>{setPickupTime(value);setConfirmed(false);setDetail(old=>old?{...old,estimate:old.estimate?{...old.estimate,valid:false}:null}:old);}} confirmed={confirmed} setConfirmed={setConfirmed} now={now} busy={busy} onEstimate={()=>void estimate()} onApprove={()=>void approve()} onReleaseMeal={async customerId => {
      setBusy(true); setError('');
      try {
        await api.releaseMeal(storeId, detail.group.id, customerId);
        setDetail(await api.detail(storeId, workspaceId, detail.group.id));
        setNotice('Meal released to preparation.');
      } catch (error) { setError(message(error)); }
      finally { setBusy(false); }
    }} onVerifyFee={async (customerId, quoteId, amountMinor, receipt) => {
      setBusy(true); setError('');
      try {
        await api.verifyFee(storeId, detail.group.id, customerId, quoteId, amountMinor, receipt);
        setDetail(await api.detail(storeId, workspaceId, detail.group.id));
        setNotice('External delivery fee verified.');
      } catch (error) { setError(message(error)); }
      finally { setBusy(false); }
    }} />:<p>Select a group to review addresses and meals. / 请选择团购，审核地址和餐点。</p>}</section></div>
  </main>;
}
