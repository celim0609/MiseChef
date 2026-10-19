import { useState } from 'react';
import type { StoreOrder } from './types';
import { getOrderTickets, printOrderTickets } from './orderTickets';
import { toMalaysiaDateKey } from './posOrderModel';

export default function OrderTicketPanel({ orders }: { orders: StoreOrder[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const today = toMalaysiaDateKey();
  const tickets = orders.filter(order => order.fulfilmentStatus !== 'Cancelled').flatMap(getOrderTickets).filter(ticket => ticket.date === today);
  const print = (kind: 'customer' | 'kitchen') => {
    try { printOrderTickets(tickets.filter(ticket => selected.includes(ticket.key)), kind); setError(''); }
    catch (error) { setError(error instanceof Error ? error.message : 'Unable to print tickets.'); }
  };
  return <details className="m-4 rounded-xl border p-4"><summary className="cursor-pointer font-bold">Today’s Customer Tickets ({tickets.length})</summary>
    <p className="my-2 text-sm">Select individual fulfilments. Print 8 tickets per A4 sheet.</p>
    <button type="button" className="mr-4 underline" onClick={() => setSelected(tickets.map(ticket => ticket.key))}>Select all today</button>
    <button type="button" className="underline" onClick={() => setSelected([])}>Clear selection</button>
    <div className="my-3 max-h-64 overflow-auto">{tickets.map(ticket => <label key={ticket.key} className="flex gap-2 p-2"><input type="checkbox" checked={selected.includes(ticket.key)} onChange={event => setSelected(current => event.target.checked ? [...current, ticket.key] : current.filter(key => key !== ticket.key))} />{ticket.orderNumber} · {ticket.customerName} · {ticket.date} {ticket.time} · {ticket.method}</label>)}</div>
    <button type="button" disabled={!tickets.some(ticket => selected.includes(ticket.key))} onClick={() => print('customer')} className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white disabled:opacity-50">Print Customer Tickets</button>
    <button type="button" disabled={!tickets.some(ticket => selected.includes(ticket.key))} onClick={() => print('kitchen')} className="ml-3 rounded-xl border px-4 py-3 font-bold disabled:opacity-50">Print Kitchen Tickets</button>
    {error && <p role="alert">{error}</p>}
  </details>;
}
