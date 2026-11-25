import { useState, useEffect, type ReactNode } from 'react';
import { formatPickupTimeLabel } from './storeModel';
import { scheduleDateLabel } from './storeOrderFulfilments';

export interface CompactDeliveryDay {
  date: string;
  mealName: string;
  time: string;
  timeOverride: boolean;
  addressOverride: boolean;
  address?: string;
  addressReady: boolean;
}

export default function CompactDeliverySchedule({ days, renderEditor, resetKey }: {
  resetKey?: string;
  days: CompactDeliveryDay[];
  renderEditor: (date: string) => ReactNode;
}) {
  const [editingDate, setEditingDate] = useState('');
  useEffect(() => setEditingDate(''), [resetKey]);
  return <div className="divide-y divide-surface-container-high rounded-xl border border-surface-container-high">
    {days.map(day => {
      const editing = editingDate === day.date;
      return <section key={day.date} className="min-w-0 px-3 py-2" aria-label={`Delivery on ${day.date}`}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-on-surface-variant">{scheduleDateLabel(day.date)}</p>
            <p className="break-words text-sm font-bold text-primary">{day.mealName}</p>
            <p className="mt-1 text-sm font-bold text-primary">{day.time ? formatPickupTimeLabel(day.time, 'MY') : 'Choose a delivery time'}{day.timeOverride && <span className="ml-2 text-xs text-amber-800">Time override</span>}</p>
            <p className={`mt-0.5 break-words text-xs ${day.addressReady ? 'text-on-surface-variant' : 'font-bold text-error'}`}>
              {day.addressReady ? `${day.addressOverride ? 'Address override' : 'General address'} · ${day.address}` : day.addressOverride ? 'Address override · incomplete' : 'Delivery address needed'}
            </p>
          </div>
          <button type="button" aria-label={`${editing ? 'Done editing' : 'Edit delivery for'} ${day.date}`} aria-expanded={editing} aria-controls={`delivery-edit-${day.date}`} onClick={() => setEditingDate(editing ? '' : day.date)} className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-bold text-primary underline underline-offset-4">{editing ? 'Done' : 'Edit'}</button>
        </div>
        <div id={`delivery-edit-${day.date}`} hidden={!editing}>
          {editing && <div className="mt-2 space-y-3 border-t border-surface-container-high pb-2 pt-2">{renderEditor(day.date)}</div>}
        </div>
      </section>;
    })}
  </div>;
}
