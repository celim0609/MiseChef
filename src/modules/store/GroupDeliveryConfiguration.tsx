import React, { useEffect, useState } from 'react';
import { groupDeliveryService as api, type GroupDeliveryManagerData } from './services/groupDeliveryService';

// Explicit action: permissions and configuration come only from manager callables.
export default function GroupDeliveryConfiguration({ slug, userId, onSaved }: { slug: string; userId: string; onSaved: () => Promise<void> }) {
  const [data, setData] = useState<GroupDeliveryManagerData>();
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [date, setDate] = useState('');
  const [eligible, setEligible] = useState<Record<string, number>>({});
  useEffect(() => { setData(undefined); let live = true; api.configuration(slug).then(result => { if (live) { setData(result); setEligible(result.config.eligibleProducts); setDate(result.dates[0] || ''); } }).catch(() => {}); return () => { live = false; }; }, [slug, userId]);
  const save = async (enabled: boolean) => {
    if (!data) return; setBusy(true); setError(''); setNotice('');
    try {
      const dates = Object.fromEntries(Object.entries<{ closesAt: string }>(data.config.dates).filter(([, d]) => Date.parse(d.closesAt) > Date.now()));
      if (enabled) dates[date] = { closesAt: new Date(Date.parse(`${date}T17:00:00+08:00`) - 86400000).toISOString() };
      await api.configure(slug, { enabled, eligibleProducts: eligible, dates });
      setData({ ...data, config: { enabled, eligibleProducts: eligible, dates } });
      setNotice('Configuration saved. / 配置已保存。'); await onSaved();
    } catch(e) { setError(e instanceof Error ? e.message : 'Please retry. / 请重试。'); } finally { setBusy(false); }
  };
  if (!data) return null;
  return <details className="rounded-2xl border border-outline-variant p-4"><summary className="cursor-pointer font-bold">Owner/Manager · Configure pilot / 店主或经理·试点设置</summary>
    {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}{notice && <p role="status">{notice}</p>}
    {data && <div className="mt-4 space-y-4"><p>RM0 delivery after approval. Mark only main lunch meals; portions per unit excludes sides and drinks. / 获批后配送费RM0。仅勾选午餐主餐；每件份数不包括配菜和饮料。</p>
      {data.products.map(p => <label key={p.productId} className="flex flex-wrap items-center gap-3"><input type="checkbox" checked={Boolean(eligible[p.productId])} disabled={busy} onChange={e => setEligible(old => { const next = { ...old }; if (e.target.checked) next[p.productId] = 1; else delete next[p.productId]; return next; })} />{p.name}
        {eligible[p.productId] && <input aria-label={`${p.name} portions per unit / 每件午餐份数`} type="number" min={1} max={10} value={eligible[p.productId]} disabled={busy} className="w-20 rounded border bg-surface p-2" onChange={e => setEligible(old => ({ ...old, [p.productId]: Number(e.target.value) }))} />}</label>)}
      <label className="block">Delivery date / 配送日期<select className="ml-3 rounded border bg-surface p-2" value={date} onChange={e => setDate(e.target.value)} disabled={busy}>{data.dates.map(d => <option key={d}>{d}</option>)}</select></label>
      <p className="text-sm">Delivery 11:00 AM–1:00 PM MYT. Cutoff 5:00 PM MYT the previous day.</p>
      <p className="text-sm">Enabling adds this date and keeps other future dates. This does not approve a group or invite payment. / 开启将添加此日期并保留其他未来日期；不会批准成团或发出付款邀请。</p>
      <button disabled={busy || !date || !Object.keys(eligible).length} onClick={() => save(true)} className="rounded-full bg-primary px-4 py-2 text-on-primary">Enable / 开启</button>
      <button disabled={busy} onClick={() => save(false)} className="ml-3 underline">Pause new reservations / 暂停新预订</button>
    </div>}
  </details>;
}
