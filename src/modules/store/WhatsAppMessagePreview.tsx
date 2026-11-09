import type { RegionCode } from '../../regions';
import { customerActionUrl } from './customerCommunicationModel';
import type { StoreOrder } from './types';

export default function WhatsAppMessagePreview({ order, country, message, onChange, onClose, onOpen }: {
  order: StoreOrder;
  country: RegionCode;
  message: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onOpen?: () => void;
}) {
  const href = customerActionUrl(order, country, message.trim());
  return (
    <section aria-label="WhatsApp Preview" className="mt-3 min-w-0 space-y-3 rounded-xl border p-3">
      <label className="block text-sm font-bold">
        WhatsApp Preview
        <textarea
          className="mt-2 block min-h-44 w-full resize-y rounded-lg border bg-white p-3 text-sm text-slate-900"
          rows={8}
          value={message}
          onChange={event => onChange(event.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {href ? <a href={href} target="_blank" rel="noreferrer" onClick={onOpen} className="rounded-full border border-green-700 px-4 py-3 text-xs font-bold">Open WhatsApp</a>
          : <button type="button" disabled className="rounded-full border px-4 py-3 text-xs opacity-50">Open WhatsApp</button>}
        <button type="button" onClick={onClose} className="rounded-full border px-4 py-3 text-xs">Close preview</button>
      </div>
    </section>
  );
}
