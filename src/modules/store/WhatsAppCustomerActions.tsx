import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import type { RegionCode } from '../../regions';
import type { StoreOrder } from './types';
import { toMalaysiaDateKey } from './posOrderModel';
import { customerActionMessage, customerActionUrl, customerMessageSchedule, type CustomerAction } from './customerCommunicationModel';

export default function WhatsAppCustomerActions({ order, country, storeName, className = '', canRecordReminder = false }: {
  order: StoreOrder; country: RegionCode; storeName: string; className?: string; canRecordReminder?: boolean;
}) {
  const today = toMalaysiaDateKey();
  const dates = [...new Set(customerMessageSchedule(order).map(entry => entry.date).filter(Boolean))].sort();
  const [date, setDate] = useState(dates.includes(today) ? today : dates[0] || '');
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
  const status = statuses[date]?.status;
  return <section aria-label="Customer WhatsApp actions" className={`w-full space-y-3 ${className}`}>
    <p className="text-xs">Review the message in WhatsApp and press Send yourself.</p>
    <label className="block text-sm">Reminder date <select aria-label="Reminder date" value={date} onChange={event => setDate(event.target.value)} className="ml-2 rounded border p-2">{dates.map(value => <option key={value}>{value}</option>)}</select></label>
    <div className="flex flex-wrap gap-2">{([['confirm', 'Confirm Order'], ['reminder', 'Order Reminder'], ['delivery', 'Delivery Update']] as const).map(([action, label]) => {
      const message = customerActionMessage(order, action, date, today, storeName);
      const href = customerActionUrl(order, country, message);
      return href ? <a key={action} href={href} target="_blank" rel="noreferrer" className="rounded-full border border-green-700 px-4 py-3 text-xs font-bold text-green-800" onClick={() => {
        if (action === 'reminder') { setOpenedDate(date); if (canRecordReminder) void record(date, 'draft_opened'); }
      }}>{label}</a> : <button key={action} type="button" disabled className="rounded-full border px-4 py-3 text-xs opacity-50" title={message ? 'Customer phone number is invalid' : 'No items scheduled for this date'}>{label}</button>;
    })}</div>
    <p className="text-xs">Reminder for {date || 'no scheduled date'}: {status === 'owner_confirmed_sent' ? 'Sent (confirmed by owner)' : status === 'draft_opened' ? 'Draft opened; sending not confirmed' : 'Not recorded'}</p>
    {canRecordReminder && openedDate === date && status !== 'owner_confirmed_sent' && <label className="block text-xs"><input type="checkbox" checked={false} disabled={saving} onChange={() => void record(date, 'owner_confirmed_sent')} /> I reviewed and sent this reminder in WhatsApp</label>}
    {saving && <p role="status" className="text-xs">Saving reminder status...</p>}
    {error && <p role="alert" className="text-xs text-error">{error} Open the reminder again to retry recording its status.</p>}
  </section>;
}
