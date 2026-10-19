import { useState } from 'react';
import type { StoreOrder } from './types';
import { getOrderTickets } from './orderTickets';
import { dailyStatus } from './dailyOrderModel';
import { isOrderOperationallyEligible, toMalaysiaDateKey } from './posOrderModel';
import { storeOrderService } from './services';

export default function DailyFulfilmentQueue({ orders }: { orders: StoreOrder[] }) {
  const [busy, setBusy] = useState(''); const [error, setError] = useState('');
  const today = toMalaysiaDateKey();
  const entries = orders.filter(order => (order.fulfilments?.length || order.weeklyFulfilments?.length) && order.fulfilmentStatus !== 'Cancelled' && isOrderOperationallyEligible(order)).flatMap(order => getOrderTickets(order).filter(ticket => ticket.date === today && dailyStatus(order, ticket) !== 'Completed').map(ticket => ({order,ticket}))).sort((a, b) => a.ticket.time.localeCompare(b.ticket.time) || a.ticket.orderNumber.localeCompare(b.ticket.orderNumber));
  if (!entries.length) return null;
  return <section className="m-4" aria-label="Today’s fulfilments"><h2 className="text-xl font-bold">Today’s fulfilments</h2>{error && <p role="alert">{error}</p>}<div className="grid gap-4 md:grid-cols-3">{entries.map(({order,ticket}) => {
    const status = dailyStatus(order,ticket); const next = status === 'Ready' ? 'Completed' : status === 'Preparing' ? 'Ready' : 'Preparing';
    return <article key={ticket.key} className="rounded-xl border p-4"><h3 className="text-xl font-bold">{ticket.orderNumber} · {ticket.pickupCode}</h3><p>{ticket.customerName} · {ticket.date} {ticket.time} · {ticket.method}</p><p className="font-bold">{status}</p><ul>{ticket.items.map((item,index) => <li key={index}>{item.quantity} × {item.name}{item.modifiers.map((modifier,i) => <small key={i} className="block">{modifier}</small>)}</li>)}</ul>{ticket.notes && <p>Notes: {ticket.notes}</p>}
      {!(ticket.method === 'delivery' && next === 'Completed') ? <button disabled={Boolean(busy)} className="mt-3 rounded-xl bg-blue-600 p-3 font-bold text-white disabled:opacity-50" onClick={async () => {setBusy(ticket.key);setError('');try {await storeOrderService.updateFulfilment(order.id,next,'',ticket.weeklyDay,ticket.fulfilmentId);} catch(error){setError(error instanceof Error ? error.message : 'Unable to update fulfilment.');} finally {setBusy('');}}}>{busy === ticket.key ? 'Updating…' : `Mark ${next}`}</button> : <p>Ready · Manage delivery in Store Orders</p>}
    </article>;
  })}</div></section>;
}
