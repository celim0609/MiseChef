import StorePaymentCheckout from './StorePaymentCheckout';
import { storePaymentService } from './services/paymentService';
import type { StorePaymentSession } from './types';
import GroupDeliveryProgress from './GroupDeliveryProgress';
import GroupDeliveryConfiguration from './GroupDeliveryConfiguration';
import React, { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { groupDeliveryService as api, type DeliveryProgress, type DeliverySelection } from './services/groupDeliveryService';

const field = 'mt-1 block w-full rounded-xl border border-outline-variant bg-surface p-3 text-on-surface';
const action = 'rounded-full bg-primary px-5 py-3 font-bold text-on-primary disabled:opacity-50';
const message = (error: unknown) => error instanceof Error ? error.message : 'Please retry. / 请重试。';
export function GroupDeliveryStoreLink({ slug }: { slug: string }) {
  const [available, setAvailable] = useState(false);
  useEffect(() => { let live = true; api.get(slug).then(p => { if (live) setAvailable(p.available && Boolean(p.dates?.length)); }).catch(() => {}); return () => { live = false; }; }, [slug]);
  if (!available) return null;
  return <a href={`/store/${encodeURIComponent(slug)}/group-delivery`} className="block rounded-2xl border border-primary/20 bg-primary/5 p-5 font-bold text-primary">Group lunch delivery / 午餐团购配送 →<span className="mt-2 block text-sm">10 lunch portions · Free delivery after approval / 满10份午餐，获批后免费配送</span></a>;
}
export default function PublicGroupDeliveryPage({ slug, currentUser }: { slug: string; currentUser: User | null }) {
  const [areaId, setAreaId] = useState(() => new URLSearchParams(window.location.search).get('area') || '');
  const [date, setDate] = useState(() => new URLSearchParams(window.location.search).get('date') || '');
  const [paymentMethod, setPaymentMethod] = useState('stripe');
  const [paymentSession, setPaymentSession] = useState<StorePaymentSession>();
  const [fallbackTime, setFallbackTime] = useState('11:30');
  const [fallbackQuote, setFallbackQuote] = useState<{ customerDeliveryFee: number; expiresAt: string }>();
  const [progress, setProgress] = useState<DeliveryProgress>();
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [selections, setSelections] = useState<Record<string, DeliverySelection>>({});
  const [query, setQuery] = useState(''), [suggestions, setSuggestions] = useState<{ placeId: string; label: string }[]>([]);
  const [place, setPlace] = useState<{ placeId: string; formattedAddress: string; eligible: boolean }>();
  const [language, setLanguage] = useState('en');
  const [name, setName] = useState(currentUser?.displayName || ''), [phone, setPhone] = useState(''), [unit, setUnit] = useState('');
  const session = useRef(crypto.randomUUID()), generation = useRef(0), pending = useRef<{ fingerprint: string; id: string }>();
  const load = useCallback(async () => {
    const p = await api.get(slug, date, areaId || undefined); setProgress(p);
    if (!date && p.date) setDate(p.date);
  }, [slug, date, areaId, currentUser?.uid]);
  useEffect(() => {
    const url = new URL(window.location.href);
    const provider = url.searchParams.get('payment_provider');
    const session = url.searchParams.get('payment_session_id');
    const token = url.searchParams.get('payment_access_token');
    if (!currentUser || (provider !== 'stripe' && provider !== 'curlec') || !session || !token) return;
    void storePaymentService.getResult(slug, provider, session, token).then(async () => {
      for (const key of ['payment_provider', 'payment_session_id', 'payment_access_token']) url.searchParams.delete(key);
      window.history.replaceState(null, '', url);
      await load();
    }).catch(error => setError(message(error)));
  }, [slug, currentUser?.uid, load]);
  useEffect(() => { let live = true; const refresh = () => api.get(slug, date, areaId || undefined).then(p => { if (live) { setProgress(p); if (!date && p.date) setDate(p.date); } }).catch(e => { if (live) setError(message(e)); }); void refresh(); const timer = setInterval(refresh, 30000); return () => { live = false; clearInterval(timer); }; }, [slug, date, areaId, currentUser?.uid]);
  useEffect(() => {
    if (!currentUser || place || query.trim().length < 3) return;
    const request = generation.current;
    let live = true;
    const timer = setTimeout(() => { void api.search(query, session.current, language).then(r => { if (live && request === generation.current) setSuggestions(r.suggestions); }).catch(e => { if (live) setError(message(e)); }); }, 400);
    return () => { live = false; clearTimeout(timer); };
  }, [query, place, language, currentUser]);
  const changeDate = (next: string) => { generation.current++; setDate(next); setPaymentSession(undefined); setFallbackQuote(undefined); setProgress(undefined); setSelections({}); setNotice(''); setError(''); pending.current = undefined; const url = new URL(window.location.href); url.searchParams.set('date', next); const area = url.searchParams.get('area'); if (area) { url.searchParams.delete('area'); url.searchParams.set('area', area); } window.history.replaceState(null, '', url); };
  const choose = async (placeId: string) => {
    const request = ++generation.current; setError('');
    try { const p = await api.check(placeId, areaId || undefined); if (request !== generation.current) return; setPlace({ placeId, ...p }); setQuery(p.formattedAddress); setSuggestions([]); session.current = crypto.randomUUID(); }
    catch (e) { if (request === generation.current) setError(message(e)); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (busy || !place?.eligible) return;
    setBusy(true); setError(''); setNotice('');
    const reservation = { date, areaId: areaId || undefined, selections: Object.values<DeliverySelection>(selections).filter(s => s.quantity > 0), placeId: place.placeId, name, phone, unit };
    const fingerprint = JSON.stringify(reservation);
    if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, id: crypto.randomUUID() };
    try {
      const result = await api.reserve(slug, { ...reservation, requestId: pending.current.id });
      setNotice(result.status === 'reserved' ? 'Joined—awaiting approval. No payment taken; your order is not confirmed. / 已参加，等待审核。尚未付款，订单尚未确认。' : 'This reservation has expired or was cancelled. / 此预订已过期或取消。');
      await load();
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  };
  const share = async () => {
    if (!progress?.sharePath) return;
    try { const url = new URL(progress.sharePath, window.location.origin).href; await navigator.clipboard.writeText(url); setNotice('Group link copied. / 团购链接已复制。'); } catch { setNotice('Copy the group link below. / 请复制下方团购链接。'); }
  };
  const reserved = progress?.mine?.status === 'reserved';
  const closed = progress?.status === 'closed' || progress?.status === 'approved';
  const total = Object.values<DeliverySelection>(selections).reduce((n, s) => n + s.quantity * (progress?.menu?.find(m => m.productId === s.productId)?.portionsPerUnit || 0), 0);
  return <div className="mx-auto max-w-2xl space-y-6 text-on-surface">
    <a href={`/store/${encodeURIComponent(slug)}`} className="font-bold text-primary">← Store / 店铺</a>
    <header><h1 className="text-2xl font-bold text-primary">Group lunch delivery / 午餐团购配送</h1><p className="mt-1 text-sm">1 km radius · 10 lunch portions per area and date</p></header>
    {currentUser && <GroupDeliveryConfiguration userId={currentUser.uid} slug={slug} onSaved={load} />}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-green-50 p-4 text-green-900">{notice}</p>}
    {!progress ? <p>Loading / 加载中…</p> : !progress.available ? <p>Reservations are not open for this Store yet. / 此店铺尚未开放团购预订。</p> : <>
      {progress.areas && <label className="block font-bold">Area / 区域<select className={field} value={areaId || progress.areaId} disabled={busy} onChange={event => {
        const next = event.target.value;
        changeDate(date);
        setAreaId(next);
        setPlace(undefined);
        setQuery('');
        setSuggestions([]);
        const url = new URL(window.location.href);
        url.searchParams.set('date', date);
        url.searchParams.set('area', next);
        window.history.replaceState(null, '', url);
      }}>{progress.areas.map(area => <option key={area.areaId} value={area.areaId}>{area.areaName}</option>)}</select></label>}
      <label className="block font-bold">Delivery date / 配送日期<select className={field} value={date} onChange={e => changeDate(e.target.value)} disabled={busy}>
        {!progress.dates?.length && <option value="">No dates available / 暂无日期</option>}
        {date && !progress.dates?.includes(date) && <option value={date}>{date} · Closed / 已截止</option>}
        {progress.dates?.map(d => <option key={d} value={d}>{d}</option>)}
      </select></label>
      {progress.date && <><GroupDeliveryProgress progress={progress} />
      {progress.sharePath && <div className="space-y-2"><button type="button" className={action} onClick={share}>Copy group link / 复制团购链接</button><a className="block break-all text-sm underline" href={progress.sharePath}>{new URL(progress.sharePath, window.location.origin).href}</a></div>}
      {progress.mine && <div className="rounded-xl border p-4"><p>Your reservation / 您的预订：{progress.mine.portions} · {progress.mine.cancellationRequested ? 'Cancellation requested / 已申请取消' : progress.mine.deliveryFeeVerified ? 'Delivery fee verified / 配送费已确认' : progress.mine.paymentConfirmed ? 'Meal paid / 午餐已付款' : reserved ? 'Reserved / 已预订' : progress.mine.status === 'expired' ? 'Expired / 已过期' : 'Cancelled / 已取消'}</p>
        {reserved && !progress.mine.checkoutLinked && !progress.mine.paymentConfirmed && progress.status !== 'approved' && <button type="button" disabled={busy} className="mt-3 underline" onClick={async () => { setBusy(true); try { await api.cancel(slug, date, areaId || undefined); pending.current = undefined; await load(); setNotice('Reservation cancelled. / 预订已取消。'); } catch(e) { setError(message(e)); } finally { setBusy(false); } }}>Cancel reservation / 取消预订</button>}
      </div>}
      {progress.mine?.paymentConfirmed && <p role="status" className="font-bold">{
        progress.mine.mealReleased ? 'Delivery Confirmed' :
        progress.status === 'approved' ? 'Free Delivery Confirmed' :
        progress.canChooseFallback ? 'Additional Delivery Payment Required' :
        progress.mine.deliveryFeeVerified ? 'Awaiting fulfilment release' :
        progress.status === 'ready_for_review' ? 'Group Qualified · Awaiting Approval' : 'Waiting for Group'
      }</p>}
      {currentUser && reserved && !progress.mine?.paymentConfirmed && !closed && Boolean(progress.paymentMethods?.length) &&
        (paymentSession ? <StorePaymentCheckout session={paymentSession} customerName={name} phone={phone}
          customerEmail={currentUser.email || ''} currency="MYR" total={paymentSession.orderSummary?.totals.grandTotal || 0}
          storeSlug={slug} storeName={slug} storeWhatsApp="" country="MY"
          returnUrl={(() => {
            const url = new URL(progress.sharePath || window.location.pathname, window.location.origin);
            url.searchParams.set('payment_provider', paymentSession.provider);
            url.searchParams.set('payment_session_id', paymentSession.paymentSessionId);
            url.searchParams.set('payment_access_token', paymentSession.checkoutAccessToken);
            return url.href;
          })()}
          onComplete={async paymentSessionId => {
            await storePaymentService.getResult(slug, paymentSession.provider, paymentSessionId, paymentSession.checkoutAccessToken);
            await load(); setPaymentSession(undefined);
          }} onBack={() => setPaymentSession(undefined)} />
          : <div className="flex flex-wrap items-end gap-2">
            <label>Meal payment<select className={field} value={progress.paymentMethods?.includes(paymentMethod as 'stripe' | 'curlec') ? paymentMethod : progress.paymentMethods?.[0]}
              onChange={event => setPaymentMethod(event.target.value)} disabled={busy}>
              {progress.paymentMethods?.map(method => <option key={method} value={method}>{method === 'stripe' ? 'Stripe' : 'Curlec'}</option>)}
            </select></label>
            <button type="button" className={action} disabled={busy} onClick={async () => {
              setBusy(true); setError('');
              try {
                const selected = progress.paymentMethods?.find(method => method === paymentMethod) || progress.paymentMethods?.[0];
                if (!selected) return;
                const returnUrl = new URL(progress.sharePath || window.location.pathname, window.location.origin).href;
                const session = await api.checkout(slug, { date, areaId: areaId || undefined, paymentMethodId: selected,
                  customerEmail: currentUser.email || '' }, returnUrl);
                if (session.checkout.type === 'provider_redirect' || session.checkout.type === 'curlec_payment_link') window.location.assign(session.checkout.redirectUrl);
                else setPaymentSession(session);
              } catch (error) { setError(message(error)); }
              finally { setBusy(false); }
            }}>Pay for reserved meals</button>
          </div>)}
      {progress.canChooseFallback && <div className="space-y-2 rounded-xl border p-3">
        <p>Group target missed. Check a paid delivery quote or request cancellation.</p>
        <label>Delivery time (MYT)<input className={field} type="time" min="11:00" max="12:59" value={fallbackTime} disabled={busy} onChange={event => {
          setFallbackTime(event.target.value);
          setFallbackQuote(undefined);
        }} /></label>
        <div className="flex flex-wrap gap-3">
          <button type="button" className={action} disabled={busy} onClick={async () => {
            setBusy(true); setError(''); setFallbackQuote(undefined);
            try { setFallbackQuote(await api.quoteFallback(slug, date, areaId || undefined, fallbackTime)); }
            catch (error) { setError(message(error)); }
            finally { setBusy(false); }
          }}>Get delivery quote</button>
          <button type="button" className="underline" disabled={busy} onClick={async () => {
            setBusy(true); setError('');
            try {
              await api.requestCancellation(slug, date, areaId || undefined);
              setFallbackQuote(undefined);
              setNotice('Cancellation requested. The Store will review your payment.');
              await load();
            } catch (error) { setError(message(error)); }
            finally { setBusy(false); }
          }}>Request cancellation</button>
        </div>
        {fallbackQuote && <p>Delivery RM{fallbackQuote.customerDeliveryFee.toFixed(2)} · Quote expires {new Date(fallbackQuote.expiresAt).toLocaleTimeString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })} MYT. Contact the Store to arrange payment and share your receipt.</p>}
      </div>}
      {!currentUser ? <a className={action + ' inline-block'} href={`/login?returnTo=${encodeURIComponent(`/store/${slug}/group-delivery?date=${date}&area=${encodeURIComponent(areaId || progress.areaId || '')}`)}`}>Sign in to join / 登录参加</a> : !reserved && !closed && <form onSubmit={submit} className="space-y-5">
        <h2 className="text-xl font-bold">Choose lunch / 选择午餐</h2>
        {!progress.menu?.length && <p>No lunch meals available for this date. / 此日期暂无午餐。</p>}
        {progress.menu?.map(meal => <fieldset key={meal.productId} className="space-y-3 rounded-2xl border border-outline-variant p-4">
          <legend className="px-2 font-bold">{meal.name}</legend><p>RM{meal.price.toFixed(2)} · {meal.portionsPerUnit} portion(s) per unit / 每份商品含{meal.portionsPerUnit}份午餐</p>
          <label className="block">Quantity / 数量<input className={field} type="number" min={0} max={20} value={selections[meal.productId]?.quantity || 0} onChange={e => setSelections(old => ({ ...old, [meal.productId]: { ...old[meal.productId], productId: meal.productId, quantity: Number(e.target.value) } }))} /></label>
          {meal.optionGroups.map(group => <fieldset key={group.id}><legend>{group.name}{group.required ? ' · Required / 必选' : ''}</legend>{group.options.filter(o => o.active !== false).map(option => {
            const selected = selections[meal.productId]?.selectedMealOptions || [];
            const checked = selected.some(s => s.optionGroupId === group.id && s.optionId === option.id);
            return <label key={option.id} className="mr-4 inline-flex items-center gap-2 py-2"><input type={group.selection === 'single' ? 'radio' : 'checkbox'} name={`${meal.productId}-${group.id}`} checked={checked} onChange={e => {
              const rest = selected.filter(s => !(s.optionGroupId === group.id && (group.selection === 'single' || s.optionId === option.id)));
              setSelections(old => ({ ...old, [meal.productId]: { ...old[meal.productId], productId: meal.productId, quantity: old[meal.productId]?.quantity || 1, selectedMealOptions: e.target.checked ? [...rest, { serviceDate: date, optionGroupId: group.id, optionId: option.id }] : rest } }));
            }} />{option.name} {option.priceAdjustmentMinor ? `(+RM${(option.priceAdjustmentMinor / 100).toFixed(2)})` : ''}</label>;
          })}</fieldset>)}
        </fieldset>)}
        <p className="font-bold">Selected / 已选：{total} lunch portions / 份午餐</p>
        <label className="block">Address search language / 地址搜索语言<select className={field} value={language} onChange={e => { generation.current++; setLanguage(e.target.value); }}><option value="en">English</option><option value="zh-CN">简体中文</option></select></label>
        <label className="block">Search delivery address / 搜索配送地址<input className={field} maxLength={200} value={query} onChange={e => { generation.current++; setQuery(e.target.value); setPlace(undefined); setSuggestions([]); setError(''); }} placeholder="Street and house number / 街道与门牌号" autoComplete="off" /></label>
        {suggestions.map(s => <button type="button" key={s.placeId} className="block w-full rounded-xl border p-3 text-left" onClick={() => choose(s.placeId)}>{s.label}</button>)}
        {place && <p role="status" className="font-bold">{place.eligible ? 'Address is within 1 km / 地址在1公里范围内' : 'Outside pilot area / 地址不在试点范围内'}</p>}
        <label className="block">Unit / floor / instructions · 单位、楼层或备注<input className={field} maxLength={300} value={unit} onChange={e => setUnit(e.target.value)} /></label>
        <label className="block">Name / 姓名<input required className={field} maxLength={100} value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></label>
        <label className="block">Phone / 电话<input required type="tel" className={field} maxLength={25} value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" /></label>
        <p className="text-sm">Your address is private and is never shown on the shared group page. Meals and availability will be reviewed before payment. Joining does not reserve kitchen stock. / 您的地址保密，不会显示在分享页面。付款前将审核餐点及供应情况；参加拼团不锁定厨房库存。</p>
        <button className={action} disabled={busy || !place?.eligible || total < 1 || !progress.menu?.length}>{busy ? 'Submitting / 提交中…' : 'Join without payment / 参加，暂不付款'}</button>
      </form>}</>}
    </>}
  </div>;
}
