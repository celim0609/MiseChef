import React from 'react';
import type { StoreOrder } from './types';
import { resolveDeliveryDispatchData, deliveryBlockedMessage, canonicalFulfilmentMethod } from '../../../functions/storeFulfilmentCanonical.js';

export default function DeliveryDispatchAction({ order, fulfilmentId, isUpdating, onDispatch }: { order: StoreOrder; fulfilmentId: string; isUpdating: boolean; onDispatch: (orderId: string, fulfilmentId: string) => void }) {
  const day = order.fulfilments?.find(day => day.id === fulfilmentId);
  if (!day || canonicalFulfilmentMethod(order, day) !== 'delivery' || order.manualOrder || order.payment.status !== 'paid' || ['Completed', 'Cancelled'].includes(order.fulfilmentStatus) || order.fulfilmentCompletion?.[day.id]) return null;
  const operation = order.fulfilmentOperations?.[day.id];
  const status = operation?.dispatch?.status || 'not_requested';
  if (!['not_requested', 'failed'].includes(status)) return null;
  const issues = resolveDeliveryDispatchData(order, day).issues;
  const ready = operation?.kitchenStatus === 'Ready';
  const reason = issues.length ? deliveryBlockedMessage(issues) : !ready ? 'Mark this paid delivery day Ready in Orders or POS to start dispatch. Request Lalamove is available for safe manual dispatch or retry.' : 'Book delivery for this day using its saved time and address.';
  const reasonId = `dispatch-reason-${day.id}`;
  return <div className="mt-2"><button type="button" disabled={isUpdating || !ready || issues.length > 0} aria-describedby={reasonId} onClick={() => onDispatch(order.id, day.id)} className="m-2 rounded-full bg-primary px-4 py-2 text-on-primary disabled:opacity-50">Request Lalamove</button><p id={reasonId} role={issues.length ? 'alert' : 'status'}>{reason}</p></div>;
}
