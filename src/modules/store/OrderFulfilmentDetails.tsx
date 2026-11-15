import React from 'react';
import { getOrderTickets } from './orderTickets';
import { formatPickupDateLabel, formatPickupTimeLabel } from './storeModel';
import type { StoreOrder } from './types';
import type { RegionCode } from '../../regions';

export default function OrderFulfilmentDetails({ order, country }: { order: StoreOrder; country: RegionCode }) {
  const tickets = getOrderTickets(order);
  if (!tickets.length) return <div className="sm:col-span-2" role="status">Fulfilment schedule needs review. Check the original order before dispatch.</div>;
  return <>{tickets.map(ticket => {
    const delivery = ticket.method === 'delivery';
    const label = delivery ? 'Delivery' : 'Pickup';
    return <React.Fragment key={ticket.key}>
      <div><dt className="font-sans text-[10px] font-extrabold uppercase text-outline">{label} Date</dt><dd className="mt-1 text-sm font-extrabold text-primary">{formatPickupDateLabel(ticket.date, country)}</dd></div>
      <div><dt className="font-sans text-[10px] font-extrabold uppercase text-outline">{label} Time</dt><dd className="mt-1 text-sm font-extrabold text-primary">{ticket.time ? formatPickupTimeLabel(ticket.time, country) : 'Time needs confirmation'}</dd></div>
      <div className="sm:col-span-2"><dt className="font-sans text-[10px] font-extrabold uppercase text-outline">{delivery ? 'Delivery Address' : 'Pickup Location'}</dt><dd className="mt-1 whitespace-pre-line text-sm font-extrabold text-primary">{delivery ? ticket.address || 'Delivery address missing — verify before dispatch' : order.fulfilments?.find(day => day.id === ticket.fulfilmentId)?.pickupLocationName || order.pickupLocationName}{!delivery && ticket.address && <p>{ticket.address}</p>}</dd></div>
    </React.Fragment>;
  })}</>;
}
