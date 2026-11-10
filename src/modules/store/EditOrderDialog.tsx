import { useEffect, useRef, useState, type FormEvent } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import type { StoreOrder } from './types';

interface EditSlot {
  id: string;
  date: string;
  time: string;
  method: 'pickup' | 'delivery';
  address: string;
  blocked: boolean;
}

interface EditDetails {
  revision: string;
  customerName: string;
  phone: string;
  customerRemarks: string;
  internalNotes: string;
  slots: EditSlot[];
  audit: Array<{ id: string; actor: string; at: string; changes: Array<{ field: string; before: string; after: string }> }>;
}

export function canEditOrderDetails(order: StoreOrder) {
  return !order.deletedAt && !order.cancelledAt && !['Completed', 'Cancelled'].includes(order.fulfilmentStatus)
    && !order.groupOrder && !order.groupDelivery && !(order.manualOrder && order.payment.status === 'pending');
}

export default function EditOrderDialog({ orderId, onClose, onSaved }: {
  orderId: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [original, setOriginal] = useState<EditDetails>();
  const [draft, setDraft] = useState<EditDetails>();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [reviewAcknowledged, setReviewAcknowledged] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
    let active = true;
    if (!functions) {
      setError('Order editing is unavailable.');
      return;
    }
    void httpsCallable<{ orderId: string }, EditDetails>(functions, 'editStoreOrderDetails')({ orderId }).then(({ data }) => {
      if (active) {
        setOriginal(data);
        setDraft(data);
      }
    }).catch(error => {
      if (active) setError(error instanceof Error ? error.message : 'Unable to load order details.');
    });
    return () => { active = false; };
  }, [orderId]);

  const addressChanged = draft?.slots.some((slot, index) => slot.address !== original?.slots[index]?.address);
  function updateSlot(index: number, values: Partial<EditSlot>) {
    setDraft(current => current && ({ ...current, slots: current.slots.map((slot, i) => i === index ? { ...slot, ...values } : slot) }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!functions || !draft || !original || saving || (addressChanged && !reviewAcknowledged)) return;
    setSaving(true);
    setError('');
    const fields = ['customerName', 'phone', 'customerRemarks', 'internalNotes'] as const;
    const slots = draft.slots.flatMap((slot, index) => {
      const before = original.slots[index];
      const changes = {
        ...(slot.time !== before.time ? { time: slot.time } : {}),
        ...(slot.address !== before.address ? { address: slot.address } : {})
      };
      return Object.keys(changes).length ? [{ id: slot.id, ...changes }] : [];
    });
    try {
      await httpsCallable(functions, 'editStoreOrderDetails')({
        orderId, revision: original.revision, changes: {
          ...Object.fromEntries(fields.filter(field => draft[field] !== original[field]).map(field => [field, draft[field]])),
          ...(slots.length ? { slots } : {})
        }
      });
      onSaved?.();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save order details.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog ref={dialog} aria-labelledby="edit-order-title" onCancel={event => {
      event.preventDefault();
      if (!saving) onClose();
    }} className="m-auto max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-lg overflow-y-auto rounded-2xl bg-white p-4 text-slate-950 backdrop:bg-black/60 sm:p-6">
      <h2 id="edit-order-title" className="mb-3 text-lg font-bold">Edit order details</h2>
      {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
      {!draft && !error && <p role="status">Loading order details…</p>}
      {draft && <form id="edit-order-form" onSubmit={submit} className="space-y-3">
        <fieldset disabled={saving} className="space-y-3">
          <label className="block">Customer name<input required maxLength={120} className="block w-full rounded border p-2" value={draft.customerName} onChange={event => setDraft({ ...draft, customerName: event.target.value })} /></label>
          <label className="block">Phone number<input type="tel" maxLength={40} className="block w-full rounded border p-2" value={draft.phone} onChange={event => setDraft({ ...draft, phone: event.target.value })} /></label>
          <label className="block">Customer-visible remarks<textarea maxLength={500} className="block w-full rounded border p-2" value={draft.customerRemarks} onChange={event => setDraft({ ...draft, customerRemarks: event.target.value })} /></label>
          <label className="block">Internal notes<textarea maxLength={500} className="block w-full rounded border p-2" value={draft.internalNotes} onChange={event => setDraft({ ...draft, internalNotes: event.target.value })} /></label>
          {draft.slots.map((slot, index) => <fieldset key={slot.id} disabled={slot.blocked} className="min-w-0 space-y-2 rounded border p-3">
            <legend className="px-1 text-sm font-bold">{slot.date} · {slot.method}</legend>
            {slot.blocked && <p className="text-sm">This slot is locked. If a driver is involved, coordinate changes with them manually.</p>}
            <label className="block">Same-day time<input type="time" className="block w-full rounded border p-2" value={slot.time} onChange={event => updateSlot(index, { time: event.target.value })} /></label>
            {slot.method === 'delivery' && <label className="block">Delivery address<textarea maxLength={500} className="block w-full rounded border p-2" value={slot.address} onChange={event => {
              setReviewAcknowledged(false);
              updateSlot(index, { address: event.target.value });
            }} /></label>}
          </fieldset>)}
          {draft.slots.some(slot => slot.method === 'delivery') && <p className="text-sm">Delivery changes may require manual driver coordination.</p>}
          {addressChanged && <label className="flex items-start gap-2 rounded bg-amber-50 p-3 text-sm">
            <input type="checkbox" checked={reviewAcknowledged} onChange={event => setReviewAcknowledged(event.target.checked)} />
            I’ll review the original delivery fee and coordinate the booking manually.
          </label>}
        </fieldset>
        {draft.audit.length > 0 && <details className="rounded border p-3 text-sm">
          <summary>Recent edits</summary>
          {draft.audit.map(entry => <div key={entry.id} className="mt-2 break-words">
            <p>{new Date(entry.at).toLocaleString()} · {entry.actor}</p>
            {entry.changes.map(change => <p key={change.field}>{change.field}: {change.before || '—'} → {change.after || '—'}</p>)}
          </div>)}
        </details>}
      </form>}
      <div className="mt-4 flex flex-wrap gap-2">
        {draft && <button type="submit" form="edit-order-form" disabled={saving || Boolean(addressChanged && !reviewAcknowledged)} className="min-h-11 rounded bg-green-800 px-4 text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save changes'}</button>}
        <button type="button" disabled={saving} onClick={onClose} className="min-h-11 rounded border px-4">Close</button>
      </div>
    </dialog>
  );
}
