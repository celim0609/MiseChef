import { useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import HealthyLunchPurchasedOptions from './HealthyLunchPurchasedOptions';
import type { StoreOrder } from './types';

type HistoricalOrder = Pick<StoreOrder, 'items' | 'fulfilments' | 'currency' | 'totals'> & {
  customerName: string;
  reason: string;
  actingUserId: string;
};

export default function HistoricalWeeklyOrderLookup({ reference }: { reference: string }) {
  const [id, setId] = useState<string>();
  const [result, setResult] = useState<{ id: string; order?: HistoricalOrder; error?: string }>();
  const [loading, setLoading] = useState(false);
  const recordId = (id ?? reference).trim();
  const order = result?.id === recordId ? result.order : undefined;

  const lookup = async () => {
    if (!db || !/^[A-Za-z0-9]{20}$/.test(recordId) || loading) return;
    setLoading(true);
    setResult(undefined);
    try {
      const snapshot = await getDoc(doc(db, 'storeHistoricalWeeklyOrders', recordId));
      setResult(snapshot.exists()
        ? { id: recordId, order: snapshot.data() as HistoricalOrder }
        : { id: recordId, error: 'Historical order unavailable.' });
    } catch {
      setResult({ id: recordId, error: 'Historical order unavailable.' });
    } finally {
      setLoading(false);
    }
  };

  return <details className="border-b px-4 py-2 text-sm">
    <summary className="cursor-pointer font-bold">Look up historical order</summary>
    <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); void lookup(); }}>
      <label>Historical order reference
        <input value={id ?? reference} onChange={event => setId(event.target.value)} className="ml-2 rounded border p-2" />
      </label>
      <button disabled={loading || !/^[A-Za-z0-9]{20}$/.test(recordId)} className="rounded border px-3 py-2">Look up</button>
    </form>
    {result?.id === recordId && result.error && <p role="status">{result.error}</p>}
    {order && <div className="mt-2 space-y-1">
      <p>{order.customerName || 'Customer'} · {order.currency} {order.totals?.grandTotal.toFixed(2)}</p>
      <p>{order.reason} · Recorded by {order.actingUserId}</p>
      <ul>{order.fulfilments?.flatMap(fulfilment => fulfilment.allocations.map(allocation => {
        const item = order.items[allocation.itemIndex];
        return <li key={`${fulfilment.id}-${allocation.itemIndex}`}>
          {fulfilment.date} {fulfilment.time} · {allocation.quantity} × {item.productName} · {order.currency} {item.lineTotal.toFixed(2)}
          <HealthyLunchPurchasedOptions item={item} />
        </li>;
      }))}</ul>
    </div>}
  </details>;
}
