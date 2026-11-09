import { useId, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import type { RegionCode } from '../../regions';
import type { StoreOrder } from './types';
import { toMalaysiaDateKey } from './posOrderModel';
import WhatsAppMessagePreview from './WhatsAppMessagePreview';
import { customerActionMessage, customerActionUrl, customerMessageSchedule, safeTracking, type CustomerAction, type DeliveryProvider } from './customerCommunicationModel';

export default function WhatsAppCustomerActions({ order, country, storeName, className = '', canRecordReminder = false, canPreview = false }: {
  order: StoreOrder; country: RegionCode; storeName: string; className?: string; canRecordReminder?: boolean; canPreview?: boolean;
}) {
  const providerScopeId = useId();
  const today = toMalaysiaDateKey();
  const schedule = customerMessageSchedule(order);
  const dates = [...new Set(schedule.map(entry => entry.date).filter(Boolean))].sort();
  const [date, setDate] = useState(dates.includes(today) ? today : dates[0] || '');
  const [provider, setProvider] = useState<DeliveryProvider | ''>('');
  const [tracking, setTracking] = useState('');
  const invalidTracking = Boolean(tracking.trim() && !safeTracking(tracking.trim()));
  const [preview, setPreview] = useState<{ action: CustomerAction; date: string; message: string } | null>(null);
  const [statuses, setStatuses] = useState(order.customerReminders || {});
  const [openedDate, setOpenedDate] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  async function record(dateKey: string, status: 'draft_opened' | 'owner_confirmed_sent') {
    setSaving(true); setError('');
    try {
      const { functions } = await import('../../firebase');
      if (!functions) throw new Error('Unable to connect. Please try again.');
      const response = await httpsCallable<unknown, { status: 'draft_opened' | 'owner_confirmed_sent' }>(functions, 'recordStoreCustomerReminder')({ orderId: order.id, date: dateKey, status });
      setStatuses(previous => ({ ...previous, [dateKey]: { status: response.data.status, updatedAt: new Date().toISOString(), updatedBy: '' } }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Reminder status could not be saved.'); }
    finally { setSaving(false); }
  }
  function openAction(action: CustomerAction, dateKey: string) {
    if (action !== 'reminder') return;
    setOpenedDate(dateKey);
    if (canRecordReminder) void record(dateKey, 'draft_opened');
  }
  const status = statuses[date]?.status;
  return <section aria-label="Customer WhatsApp actions" className={`w-full space-y-3 ${className}`}>
    <p className="text-xs">Review the message and press Send in WhatsApp yourself.</p>
    <label className="block text-sm">Reminder date <select value={date} onChange={event => { setDate(event.target.value); setPreview(null); }} className="ml-2 rounded border p-2">{dates.map(value => <option key={value}>{value}</option>)}</select></label>
    {canPreview && schedule.some(entry => entry.method === 'delivery' && entry.date === today) && (
      <div>
      <label className="block text-sm">Delivery provider <select aria-describedby={providerScopeId} value={provider} onChange={event => {
        setProvider(event.target.value as DeliveryProvider | '');
        setTracking('');
        setPreview(current => current?.action === 'delivery' ? null : current);
      }} className="ml-2 rounded border p-2">
        <option value="">Use saved delivery details</option>
        <option>Lalamove</option><option>Grab</option><option>Private Driver</option>
      </select></label>
      <p id={providerScopeId} className="mt-1 text-xs">Selecting Grab or Private Driver changes only this WhatsApp draft. The saved order stays the same.</p>
      </div>
    )}
    {canPreview && provider && (
      <label className="block text-sm">Tracking link (optional)
        <input type="url" value={tracking} aria-invalid={invalidTracking} onChange={event => {
          setTracking(event.target.value);
          setPreview(current => current?.action === 'delivery' ? null : current);
        }} className="mt-1 block w-full rounded border p-2" />
        {invalidTracking && <span className="text-xs text-error">Enter an HTTPS tracking link.</span>}
      </label>
    )}
    <div className="flex flex-wrap gap-2">{([
      ['confirm', 'Confirm Order'],
      ['reminder', schedule.some(entry => entry.date === date && entry.method === 'pickup')
        && !schedule.some(entry => entry.date === date && entry.method === 'delivery') ? 'Pickup Reminder' : 'Order Reminder'],
      ['delivery', 'Delivery Update']
    ] as const).map(([action, label]) => {
      const message = customerActionMessage(order, action, date, today, storeName, provider ? { provider, tracking: tracking.trim() } : undefined);
      const href = customerActionUrl(order, country, message);
      const classes = "rounded-full border border-green-700 px-4 py-3 text-xs font-bold text-green-800";
      if (!href || (action === 'delivery' && invalidTracking)) return <button key={action} type="button" disabled className="rounded-full border px-4 py-3 text-xs opacity-50" title={action === 'delivery' && invalidTracking ? 'Enter a valid HTTPS tracking link' : message ? 'Customer phone number is invalid' : 'No matching fulfilment scheduled'}>{label}</button>;
      return canPreview ? <button key={action} type="button" className={classes} onClick={() => setPreview({ action, date, message })}>{label}</button>
        : <a key={action} href={href} target="_blank" rel="noreferrer" className={classes} onClick={() => openAction(action, date)}>{label}</a>;
    })}</div>
    {canPreview && preview && <WhatsAppMessagePreview order={order} country={country} message={preview.message}
      onChange={message => setPreview({ ...preview, message })} onClose={() => setPreview(null)}
      onOpen={() => openAction(preview.action, preview.date)} />}
    <p className="text-xs">Reminder for {date || 'no scheduled date'}: {status === 'owner_confirmed_sent' ? 'Sent (confirmed by owner)' : status === 'draft_opened' ? 'Draft opened; sending not confirmed' : 'Not recorded'}</p>
    {canRecordReminder && openedDate === date && status !== 'owner_confirmed_sent' && <label className="block text-xs"><input type="checkbox" checked={false} disabled={saving} onChange={() => void record(date, 'owner_confirmed_sent')} /> I reviewed and sent this reminder in WhatsApp</label>}
    {saving && <p role="status" className="text-xs">Saving reminder status...</p>}
    {error && <p role="alert" className="text-xs text-error">{error} Open the reminder again to retry recording its status.</p>}
  </section>;
}
