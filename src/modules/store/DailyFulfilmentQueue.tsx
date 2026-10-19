import { useState } from 'react';
import type { StoreOrder } from './types';
import { getOrderTickets } from './orderTickets';
import { dailyStatus } from './dailyOrderModel';
import { isOrderOperationallyEligible, shiftDateKey, toMalaysiaDateKey } from './posOrderModel';
import { storeOrderService } from './services';

export default function DailyFulfilmentQueue({ orders }: { orders: StoreOrder[] }) {
  const [busy, setBusy] = useState(''); const [error, setError] = useState('');
  const today = toMalaysiaDateKey();
  const [view, setView] = useState<'Today' | 'Tomorrow' | 'Upcoming'>('Today');
  const selectedDate = view === 'Tomorrow' ? shiftDateKey(today, 1) : today;
  const entries = orders.filter(order => (order.fulfilments?.length || order.weeklyFulfilments?.length) && order.fulfilmentStatus !== 'Cancelled' && isOrderOperationallyEligible(order)).flatMap(order => getOrderTickets(order).filter(ticket => (view === 'Upcoming' ? ticket.date > today : ticket.date === selectedDate) && !['Completed', 'Cancelled'].includes(dailyStatus(order, ticket))).map(ticket => ({order,ticket}))).sort((a, b) => a.ticket.date.localeCompare(b.ticket.date) || a.ticket.time.localeCompare(b.ticket.time) || a.ticket.orderNumber.localeCompare(b.ticket.orderNumber));
  return <section className="m-4" aria-label="Daily fulfilments"><h2 className="text-xl font-bold">Daily fulfilments</h2><div className="my-3 flex flex-wrap gap-2">{(['Today', 'Tomorrow', 'Upcoming'] as const).map(option => <button type="button" key={option} aria-pressed={view === option} className={`rounded-lg border px-3 py-2 ${view === option ? 'bg-blue-600 text-white' : ''}`} onClick={() => { setView(option); setError(''); }}>{option}</button>)}</div>{!entries.length && <p className="my-3 text-sm">No {view.toLowerCase()} fulfilments.</p>}{error && <p role="alert">{error}</p>}<div className="grid gap-4 md:grid-cols-3">{entries.map(({order,ticket}) => {
    const status = dailyStatus(order,ticket); const next = status === 'Ready' ? 'Completed' : status === 'Preparing' ? 'Ready' : 'Preparing';
    return <article key={ticket.key} className="rounded-xl border p-4"><h3 className="text-xl font-bold">{ticket.orderNumber} · {ticket.pickupCode}</h3><p>{ticket.customerName} · {ticket.date} {ticket.time} · {ticket.method}</p><p className="font-bold">{status}</p><ul>{ticket.items.map((item,index) => <li key={index}>{item.quantity} × {item.name}{item.modifiers.map((modifier,i) => <small key={i} className="block">{modifier}</small>)}</li>)}</ul>{ticket.notes && <p>Notes: {ticket.notes}</p>}
      {!(ticket.method === 'delivery' && next === 'Completed') ? <button disabled={Boolean(busy)} className="mt-3 rounded-xl bg-blue-600 p-3 font-bold text-white disabled:opacity-50" onClick={async () => {setBusy(ticket.key);setError('');try {await storeOrderService.updateFulfilment(order.id,next,'',ticket.weeklyDay,ticket.fulfilmentId);} catch(error){setError(error instanceof Error ? error.message : 'Unable to update fulfilment.');} finally {setBusy('');}}}>{busy === ticket.key ? 'Updating…' : `Mark ${next}`}</button> : <p>Ready · Manage delivery in Store Orders</p>}
    </article>;
  })}</div></section>;
}
