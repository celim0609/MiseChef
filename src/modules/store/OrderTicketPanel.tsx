import { useState } from 'react';
import type { StoreOrder } from './types';
import { getOrderTickets, printOrderTickets } from './orderTickets';
import { isOrderOperationallyEligible, shiftDateKey, toMalaysiaDateKey } from './posOrderModel';

export default function OrderTicketPanel({ orders }: { orders: StoreOrder[] }) {
  const [selected, setSelected] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [reprint, setReprint] = useState(false);
  const today = toMalaysiaDateKey();
  const [date, setDate] = useState(today);
  const tickets = orders.filter(order => order.fulfilmentStatus !== 'Cancelled' && isOrderOperationallyEligible(order))
    .flatMap(getOrderTickets).filter(ticket => ticket.date === date)
    .sort((a, b) => a.time.localeCompare(b.time) || a.orderNumber.localeCompare(b.orderNumber));
  const selectedTickets = selected === null ? tickets : tickets.filter(ticket => selected.includes(ticket.key));
  const changeDate = (value: string) => { setDate(value); setSelected(null); setError(''); };
  const print = (kind: 'customer' | 'kitchen') => {
    try {
      if (!selectedTickets.length) return;
      printOrderTickets(selectedTickets, kind, reprint);
      setError('');
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to print tickets.'); }
  };
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-950 shadow-sm">
    <h1 className="text-2xl font-black">Print Tickets</h1>
    <p className="mt-1 text-sm text-slate-600">Choose a date and print. All orders are selected automatically. A4 · 8 tickets per sheet.</p>
    <div className="my-5 flex flex-wrap items-center gap-2">
      <button type="button" aria-pressed={date === today} className="rounded-lg border px-4 py-3 font-semibold" onClick={() => changeDate(today)}>Today</button>
      <button type="button" aria-pressed={date === shiftDateKey(today, 1)} className="rounded-lg border px-4 py-3 font-semibold" onClick={() => changeDate(shiftDateKey(today, 1))}>Tomorrow</button>
      <label className="flex items-center gap-2 text-sm">Date <input type="date" value={date} onChange={event => changeDate(event.target.value)} className="rounded-lg border p-3" /></label>
    </div>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-bold">{date} · {tickets.length} ticket{tickets.length === 1 ? '' : 's'}</h2>
      <div className="flex gap-4 text-sm">
        <button type="button" className="underline" onClick={() => setSelected(null)}>Select all</button>
        <button type="button" className="underline" onClick={() => setSelected([])}>Clear</button>
      </div>
    </div>
    <div className="mb-5 max-h-96 divide-y overflow-auto rounded-xl border">
      {tickets.length === 0 && <p className="p-5 text-slate-600">No paid or confirmed orders for this date.</p>}
      {tickets.map(ticket => <label key={ticket.key} className="flex cursor-pointer items-start gap-3 p-4 hover:bg-slate-50">
        <input type="checkbox" className="mt-1 h-5 w-5" checked={selected === null || selected.includes(ticket.key)} onChange={event => setSelected(current => {
          const keys = current === null ? tickets.map(item => item.key) : current;
          return event.target.checked ? [...new Set([...keys, ticket.key])] : keys.filter(key => key !== ticket.key);
        })} />
        <span><strong>{ticket.orderNumber}</strong> · {ticket.customerName}<span className="block text-sm text-slate-600">{ticket.time} · {ticket.method} · {ticket.items.map(item => `${item.quantity}× ${item.name}`).join(', ')}</span></span>
      </label>)}
    </div>
    <div className="mb-4 flex flex-wrap gap-3">
      <button type="button" disabled={!selectedTickets.length} onClick={() => print('customer')} className="rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white disabled:opacity-40">Print Customer</button>
      <button type="button" disabled={!selectedTickets.length} onClick={() => print('kitchen')} className="rounded-xl bg-slate-900 px-5 py-3 font-bold text-white disabled:opacity-40">Print Kitchen</button>
    </div>
    <label className="text-sm"><input type="checkbox" className="mr-2" checked={reprint} onChange={event => setReprint(event.target.checked)} />Mark as REPRINT</label>
    {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
  </section>;
}
