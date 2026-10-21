import React, { useState } from 'react';
import type { StoreOrder } from './types';
import { getOrderTickets, type OrderTicket } from './orderTickets';
import { dailyStatus, dailyActions, dailyEntries, type DailyView } from './dailyOrderModel';
import { isOrderOperationallyEligible, toMalaysiaDateKey } from './posOrderModel';
import { storeOrderService } from './services';

export function DailyFulfilmentCard({order,ticket,onUpdated}: {order:StoreOrder;ticket:OrderTicket;onUpdated?:()=>void}) {
 const [busy,setBusy]=useState(false); const [error,setError]=useState('');
 const status=dailyStatus(order,ticket);const actions=dailyActions(order,ticket);
 return <article data-fulfilment-key={ticket.key} className="h-full rounded-xl border border-slate-300 bg-white p-4 text-slate-950 shadow-sm"><h3 className="text-xl font-bold">{ticket.orderNumber} · {ticket.pickupCode}</h3><p>{ticket.customerName} · {ticket.date} {ticket.time} · {ticket.method}</p><p className="font-bold">{status}</p><ul>{ticket.items.map((item,index)=><li key={index}>{item.quantity} × {item.name}{item.modifiers.map((modifier,i)=><small key={i} className="block">{modifier}</small>)}</li>)}</ul>{ticket.method === 'delivery' && <p className="font-bold">Delivery address: {ticket.address?.trim() || 'ADDRESS MISSING — VERIFY BEFORE DISPATCH'}</p>}{ticket.notes && <p>Notes: {ticket.notes}</p>}
 <div className="flex flex-wrap gap-2">{actions.map(next=><button key={next} disabled={busy} className="mt-3 rounded-xl bg-blue-600 p-3 font-bold text-white disabled:opacity-50" onClick={async()=>{setBusy(true);setError('');try{await storeOrderService.updateFulfilment(order.id,next,'',ticket.weeklyDay,ticket.fulfilmentId);onUpdated?.();}catch(e){setError(e instanceof Error?e.message:'Unable to update fulfilment.');}finally{setBusy(false);}}}>{busy?'Updating…':`Mark ${next}`}</button>)}</div>
 {status==='Ready' && !actions.length && <p>Ready · Manage delivery in Store Orders</p>}{error && <p role="alert">{error}</p>}</article>;
}
export default function DailyFulfilmentQueue({orders,onUpdated,view='Today'}: {orders:StoreOrder[];onUpdated?:()=>void;view?:DailyView}) {
 const today=toMalaysiaDateKey();const entries=dailyEntries(orders,view,today);
 const unresolved=orders.filter(order=>isOrderOperationallyEligible(order)&&!['Completed','Cancelled'].includes(order.fulfilmentStatus)&&!getOrderTickets(order).length);
 return <section className="w-full" aria-label="Daily fulfilments"><h2 className="text-xl font-bold">Daily fulfilments</h2>{unresolved.length>0 && <p role="status">Schedule review required: {unresolved.map(order=>order.orderNumber).join(', ')}. Item dates are missing or inconsistent; no daily preparation or ticket is available.</p>}{!entries.length&&<p>No {view.toLowerCase()} fulfilments.</p>}<div className="mt-4 grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{entries.map(({order,ticket})=><div key={ticket.key}><DailyFulfilmentCard order={order} ticket={ticket} onUpdated={onUpdated}/></div>)}</div></section>;
}
