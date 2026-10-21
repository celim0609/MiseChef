import OrderFulfilmentDetails from './OrderFulfilmentDetails';
import { canonicalFulfilmentMethod, resolveDeliveryDispatchData, deliveryBlockedMessage } from '../../../functions/storeFulfilmentCanonical.js';
import { getOrderTickets } from './orderTickets';
import { orderInPeriod, sortOrdersForPeriod, nextDailyStatus, orderMatchesStatusInPeriod } from './dailyOrderModel';
import { toMalaysiaDateKey } from './posOrderModel';
import MealOptionSummary from './MealOptionSummary';
import { useEffect, useMemo, useState, useRef } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Clock3,
  MapPin,
  PackageCheck,
  Phone,
  ReceiptText,
  X
} from 'lucide-react';
import { formatRegionCurrency } from '../../regions';
import { storeOrderService, type StoreOrderHistoryCursor } from './services';
import { storeDeliveryService } from './services/deliveryService';
import { formatPickupDateLabel, formatPickupTimeLabel } from './storeModel';
import { isOrderOperationallyEligible, sortOrdersByDeliverySchedule } from './posOrderModel';
import WhatsAppCustomerButton from './WhatsAppCustomerButton';
import type {
  StoreFulfilmentStatus,
  StoreNotification,
  StoreOrder,
  StoreOrderTimelineEvent
} from './types';

const FILTERS = [
  'All',
  'Payment Review',
  'New',
  'Confirmed',
  'Paid',
  'Preparing',
  'Ready',
  'Completed',
  'Cancelled'
] as const;

const NEXT_STATUS: Partial<Record<StoreFulfilmentStatus, StoreFulfilmentStatus>> = {
  New: 'Preparing',
  Confirmed: 'Preparing',
  Paid: 'Preparing',
  Preparing: 'Ready',
  Ready: 'Completed'
};

const formatTimePlaced = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
};

const paymentStatusLabel = (status: StoreOrder['payment']['status']) => ({
  pending: 'Pending',
  processing: 'Processing',
  paid: 'Paid',
  pending_verification: 'Pending Verification',
  failed: 'Failed',
  cancelled: 'Cancelled',
  rejected: 'Rejected'
})[status];
const deliveryLifecycleLabel = (state?: string) => ({
  not_started: 'Preparing · Driver not requested', assigning_driver: 'Finding driver…', driver_assigned: 'Driver assigned',
  picked_up: 'Picked up · On the way', completed: 'Delivered', canceled: 'Delivery cancelled',
  expired: 'No driver found / Expired', rejected: 'Driver matching failed'
})[state || 'not_started'] || 'Preparing · Driver not requested';
const activeDeliveryLifecycle = (state?: string) => ['assigning_driver', 'driver_assigned', 'picked_up'].includes(state || '');
const deliveryElapsed = (history?: Array<{ occurredAt: string }>) => {
  const startedAt = Date.parse(history?.[history.length - 1]?.occurredAt || '');
  if (!Number.isFinite(startedAt)) return '';
  return `${Math.max(0, Math.floor((Date.now() - startedAt) / 60000))} min`;
};

interface StoreOrdersPanelProps {
  storeId: string;
  workspaceId: string;
  country: 'MY' | 'SG';
  currency: 'MYR' | 'SGD';
  storeName: string;
  focusOrderId: string;
  notifications: StoreNotification[];
  onNotificationClick: (notification: StoreNotification) => void;
  canProcessOrders: boolean;
  canReviewPayments: boolean;
}

export default function StoreOrdersPanel({
  storeId,
  workspaceId,
  country,
  currency,
  storeName,
  focusOrderId,
  notifications,
  onNotificationClick,
  canProcessOrders,
  canReviewPayments
}: StoreOrdersPanelProps) {
  const [operationalOrders, setOperationalOrders] = useState<StoreOrder[]>([]);
  const [historyOrders, setHistoryOrders] = useState<StoreOrder[]>([]);
  const [historyCursor, setHistoryCursor] = useState<StoreOrderHistoryCursor | null>(null);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [timeline, setTimeline] = useState<StoreOrderTimelineEvent[]>([]);
  const handledFocusRef = useRef('');
  const [period, setPeriod] = useState<'Today' | 'Upcoming' | 'History'>('Today');
  const [activeFilter, setActiveFilter] = useState<(typeof FILTERS)[number]>('All');
  const [isUpdating, setIsUpdating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    setPeriod('Today'); setActiveFilter('All'); setSelectedOrderId('');
    setOperationalOrders([]); handledFocusRef.current = '';
  }, [storeId, workspaceId]);

  useEffect(() => storeOrderService.subscribeOperationalOrders(
    storeId,
    workspaceId,
    setOperationalOrders,
    error => setErrorMessage(error.message || 'Unable to load orders.')
  ), [storeId, workspaceId]);

  useEffect(() => {
    let cancelled = false;
    setHistoryOrders([]);
    setHistoryCursor(null);
    setHasMoreHistory(false);
    setIsHistoryLoading(true);
    void storeOrderService.getTerminalOrderHistoryPage(storeId, workspaceId)
      .then(page => {
        if (cancelled) return;
        setHistoryOrders(page.orders);
        setHistoryCursor(page.cursor);
        setHasMoreHistory(page.hasMore);
      })
      .catch(error => {
        if (!cancelled) setErrorMessage(error instanceof Error ? error.message : 'Unable to load Order History.');
      })
      .finally(() => {
        if (!cancelled) setIsHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [historyRefreshKey, storeId, workspaceId]);

  const orders = useMemo(() => {
    const ordersById = new Map<string, StoreOrder>(historyOrders.map(order => [order.id, order]));
    for (const order of operationalOrders) ordersById.set(order.id, order);
    return sortOrdersByDeliverySchedule([...ordersById.values()]);
  }, [historyOrders, operationalOrders]);

  useEffect(() => {
    const order = orders.find(order => order.id === focusOrderId);
    if (order && handledFocusRef.current !== focusOrderId) {
      handledFocusRef.current = focusOrderId;
      const today = toMalaysiaDateKey();
      setPeriod(orderInPeriod(order, 'Today', today) ? 'Today' : orderInPeriod(order, 'Upcoming', today) ? 'Upcoming' : 'History');
      setActiveFilter('All');
      setSelectedOrderId(focusOrderId);
    }
  }, [focusOrderId, orders]);

  const selectedOrder = orders.find(order => order.id === selectedOrderId) || null;

  useEffect(() => {
    if (!selectedOrderId) {
      setTimeline([]);
      return;
    }
    return storeOrderService.subscribeTimeline(
      workspaceId,
      selectedOrderId,
      setTimeline,
      error => setErrorMessage(error.message || 'Unable to load the order timeline.')
    );
  }, [selectedOrderId, workspaceId]);

  const visibleOrders = useMemo(() => sortOrdersForPeriod(orders.filter(order =>
    orderMatchesStatusInPeriod(order, period, activeFilter, toMalaysiaDateKey())
  ), period, toMalaysiaDateKey()), [activeFilter, orders, period]);

  useEffect(() => {
    if (selectedOrderId && !visibleOrders.some(order => order.id === selectedOrderId)) setSelectedOrderId('');
  }, [selectedOrderId, visibleOrders]);

  const updateStatus = async (nextStatus: StoreFulfilmentStatus, weeklyDay?: string, fulfilmentId?: string) => {
    if (!selectedOrder || isUpdating) return;
    setIsUpdating(true);
    setErrorMessage('');
    try {
      await storeOrderService.updateFulfilment(selectedOrder.id, nextStatus, '', weeklyDay, fulfilmentId);
      if (nextStatus === 'Completed' || nextStatus === 'Cancelled') {
        setHistoryRefreshKey(current => current + 1);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update this order.');
    } finally {
      setIsUpdating(false);
    }
  };

  const loadMoreHistory = async () => {
    if (!historyCursor || isHistoryLoading) return;
    setIsHistoryLoading(true);
    setErrorMessage('');
    try {
      const page = await storeOrderService.getTerminalOrderHistoryPage(storeId, workspaceId, historyCursor);
      setHistoryOrders(current => {
        const ordersById = new Map<string, StoreOrder>(current.map(order => [order.id, order]));
        for (const order of page.orders) ordersById.set(order.id, order);
        return [...ordersById.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      });
      setHistoryCursor(page.cursor);
      setHasMoreHistory(page.hasMore);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load more Order History.');
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const dispatchDelivery = async (orderId: string, fulfilmentId?: string) => {
    setErrorMessage('');
    setIsUpdating(true);
    try {
      const result = await storeDeliveryService.dispatch(orderId, fulfilmentId);
      if (result.status === 'dispatch_blocked_requote') setErrorMessage(`Dispatch blocked: refreshed fee exceeds the RM5 absorption limit by ${result.difference?.toFixed(2) || '0.00'}.`);
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Unable to dispatch delivery.'); } finally { setIsUpdating(false); }
  };
  const cancelDelivery = async (orderId: string, fulfilmentId?: string) => {
    setErrorMessage(''); setIsUpdating(true);
    try { await storeDeliveryService.cancel(orderId, fulfilmentId); } catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Unable to cancel delivery.'); } finally { setIsUpdating(false); }
  };
  const refreshDelivery = async (orderId: string, fulfilmentId?: string) => {
    setErrorMessage(''); setIsUpdating(true);
    try { await storeDeliveryService.refresh(orderId, fulfilmentId); } catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Unable to refresh delivery.'); } finally { setIsUpdating(false); }
  };

  // While this specific POS order is open, refresh at a bounded cadence. The
  // scheduled five-minute reconciliation remains the durable fallback.
  useEffect(() => {
    if (!selectedOrder || !activeDeliveryLifecycle(selectedOrder.delivery?.lifecycle?.state) || !selectedOrder.delivery?.providerOrder?.orderId) return;
    const timer = window.setInterval(() => { void storeDeliveryService.refresh(selectedOrder.id).catch(() => undefined); }, 20_000);
    return () => window.clearInterval(timer);
  }, [selectedOrder?.id, selectedOrder?.delivery?.lifecycle?.state, selectedOrder?.delivery?.providerOrder?.orderId]);

  const reviewPayment = async (decision: 'approve' | 'reject') => {
    if (!selectedOrder || isUpdating) return;
    setIsUpdating(true);
    setErrorMessage('');
    try {
      await storeOrderService.reviewManualPayment(selectedOrder.id, decision);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to review this payment.');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <section className="space-y-5">
      {notifications.length > 0 && (
        <div className="space-y-2" aria-label="New order notifications">
          {notifications.map(notification => (
            <button
              key={notification.id}
              type="button"
              onClick={() => onNotificationClick(notification)}
              className="flex w-full items-center gap-3 rounded-2xl bg-green-50 px-4 py-3 text-left text-green-900"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-700 text-white">
                <ReceiptText className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-sans text-xs font-extrabold">{notification.title}</span>
                <span className="block truncate font-sans text-xs font-bold text-green-800">{notification.message}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {errorMessage && (
        <p className="rounded-2xl bg-error/10 px-4 py-3 font-sans text-sm font-bold text-error">
          {errorMessage}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2" aria-label="Order periods">
        {(['Today', 'Upcoming', 'History'] as const).map(value => <button type="button" key={value} aria-pressed={period === value} onClick={() => { setPeriod(value); setActiveFilter('All'); setSelectedOrderId(''); }} className={`rounded-full border px-5 py-3 font-bold ${period === value ? 'border-primary bg-primary text-on-primary' : 'border-surface-container-high bg-white text-primary'}`}>{value}</button>)}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Order status filters">
        {FILTERS.map(filter => (
          <button
            key={filter}
            type="button"
            aria-pressed={activeFilter === filter}
            onClick={() => setActiveFilter(filter)}
            className={`shrink-0 rounded-full px-4 py-2.5 font-sans text-xs font-extrabold ${
              activeFilter === filter ? 'bg-primary text-on-primary' : 'bg-white text-primary shadow-sm'
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-3">
          {visibleOrders.map(order => (
            <button
              key={order.id}
              type="button"
              onClick={() => setSelectedOrderId(order.id)}
              className={`w-full rounded-3xl border p-5 text-left transition ${
                selectedOrderId === order.id
                  ? 'border-primary bg-primary/5'
                  : 'border-surface-container-high bg-white'
              }`}
            >
              <span className="flex items-start justify-between gap-4">
                <span>
                  <span className="block font-display text-xl font-bold text-primary">{order.orderNumber}</span>
                  {order.pickupCode && <span className="mt-1 block font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-secondary">{canonicalFulfilmentMethod(order)} · Code {order.pickupCode}</span>}
                  <span className="mt-1 block font-sans text-sm font-extrabold text-on-surface">{order.customerName}</span>
                </span>
                <span className="rounded-full bg-surface-container px-3 py-1.5 font-sans text-[10px] font-extrabold text-primary">
                  {order.payment.status === 'pending_verification'
                    ? 'Payment Review'
                    : order.fulfilmentStatus || paymentStatusLabel(order.payment.status)}
                </span>
              </span>
              <span className="mt-4 grid gap-2 font-sans text-xs font-bold text-on-surface-variant sm:grid-cols-2">
                {getOrderTickets(order).map(ticket => <span key={ticket.key} className="sm:col-span-2">{ticket.method === 'delivery' ? 'Delivery' : 'Pickup'} · {formatPickupDateLabel(ticket.date, country)} · {ticket.time ? formatPickupTimeLabel(ticket.time, country) : 'Time needs confirmation'} · {ticket.method === 'delivery' ? ticket.address || 'Delivery address missing' : ticket.address || order.pickupLocationName}</span>)}
                <span>{formatRegionCurrency(order.total, currency)}</span>
                <span className="inline-flex items-center gap-1.5"><Phone className="h-3 w-3" /> {order.phone}</span>
                <span>Payment: {paymentStatusLabel(order.payment.status)}</span>
              </span>
              <span className="mt-3 block font-sans text-[11px] font-bold text-outline">
                {formatTimePlaced(order.createdAt)}
              </span>
            </button>
          ))}
          {visibleOrders.length === 0 && (
            <div className="rounded-3xl border border-dashed border-outline-variant px-6 py-14 text-center">
              <PackageCheck className="mx-auto h-8 w-8 text-primary" />
              <h2 className="mt-4 font-display text-2xl font-bold text-primary">No {activeFilter === 'All' ? '' : activeFilter.toLowerCase()} orders yet</h2>
              <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">Paid customer orders will appear here.</p>
            </div>
          )}
          {hasMoreHistory && period === 'History' && (
            <button
              type="button"
              disabled={isHistoryLoading}
              onClick={() => void loadMoreHistory()}
              className="w-full rounded-full border border-surface-container-high bg-white px-5 py-3 font-sans text-xs font-extrabold text-primary disabled:opacity-50"
            >
              {isHistoryLoading ? 'Loading Order History…' : 'Load More History'}
            </button>
          )}
        </div>

        {selectedOrder ? (
          <article className="rounded-3xl bg-white p-5 shadow-sm sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.18em] text-secondary">Order Detail</p>
                <h2 className="mt-1 font-display text-3xl font-bold text-primary">{selectedOrder.orderNumber}</h2>
                {selectedOrder.pickupCode && <p className="mt-2 font-sans text-sm font-extrabold uppercase tracking-[0.18em] text-secondary">Pickup Code {selectedOrder.pickupCode}</p>}
                <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">{formatTimePlaced(selectedOrder.createdAt)}</p>
              </div>
              <button type="button" aria-label="Close order detail" onClick={() => setSelectedOrderId('')} className="rounded-full bg-surface-container p-2 text-primary"><X className="h-4 w-4" /></button>
            </div>

            <dl className="mt-6 grid gap-3 rounded-2xl bg-surface-container-low p-4 sm:grid-cols-2">
              <div><dt className="font-sans text-[10px] font-extrabold uppercase text-outline">Customer</dt><dd className="mt-1 font-sans text-sm font-extrabold text-primary">{selectedOrder.customerName}</dd></div>
              <div><dt className="font-sans text-[10px] font-extrabold uppercase text-outline">Phone</dt><dd className="mt-1"><a href={`tel:${selectedOrder.phone}`} className="inline-flex items-center gap-1.5 font-sans text-sm font-extrabold text-primary"><Phone className="h-3.5 w-3.5" /> {selectedOrder.phone}</a></dd></div>
              <OrderFulfilmentDetails order={selectedOrder} country={country} />
              <div><dt className="font-sans text-[10px] font-extrabold uppercase text-outline">Payment</dt><dd className="mt-1 font-sans text-sm font-extrabold text-primary">{paymentStatusLabel(selectedOrder.payment.status)}</dd></div>
              <div><dt className="font-sans text-[10px] font-extrabold uppercase text-outline">Payment Method</dt><dd className="mt-1 font-sans text-sm font-extrabold text-primary">{selectedOrder.paymentMethodName}</dd></div>
              <div><dt className="font-sans text-[10px] font-extrabold uppercase text-outline">Fulfilment</dt><dd className="mt-1 font-sans text-sm font-extrabold text-primary">{selectedOrder.fulfilmentStatus || 'Not started'}</dd></div>
            </dl>

            <div className="mt-6 space-y-3">
              {selectedOrder.items.map((item, itemIndex) => (
                <div key={`${selectedOrder.id}_${item.productId}_${itemIndex}`} className="rounded-2xl border border-surface-container-high p-4">
                  <div className="flex justify-between gap-4">
                    <div>
                      <h3 className="font-sans text-sm font-extrabold text-primary">{item.quantity} × {item.productName}</h3><MealOptionSummary snapshot={item.healthyLunchSnapshot} />
                      <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">Base {formatRegionCurrency(item.basePrice, currency)}</p>
                    </div>
                    <p className="font-sans text-sm font-extrabold text-primary">{formatRegionCurrency(item.lineTotal, currency)}</p>
                  </div>
                  {item.setSnapshot && (
                    <ul className="mt-3 space-y-1.5">
                      {item.setSnapshot.selectedGroups.map((selection, index) => (
                        <li key={`${selection.groupId}_${selection.productId}_${index}`} className="flex justify-between gap-3 font-sans text-xs font-bold text-on-surface-variant">
                          <span>{selection.groupName}: {selection.productName}</span>
                          <span>{selection.priceAdjustment > 0 ? `+${formatRegionCurrency(selection.priceAdjustment, currency)}` : 'Included'}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {item.selectedOptions.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {item.selectedOptions.map(option => (
                        <li key={`${option.groupId}_${option.optionId}`} className="flex justify-between gap-3 font-sans text-xs font-bold text-on-surface-variant">
                          <span>{option.groupName}: {option.optionName}{option.quantity && option.quantity > 1 ? ` x${option.quantity}` : ''}</span>
                          <span>{option.priceAdjustment >= 0 ? '+' : '−'}{formatRegionCurrency(Math.abs(option.priceAdjustment), currency)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-5 flex justify-between border-t border-surface-container-high pt-4">
              <span className="font-sans text-sm font-extrabold text-primary">Final Total</span>
              <span className="font-display text-2xl font-bold text-primary">{formatRegionCurrency(selectedOrder.total, currency)}</span>
            </div>

            {selectedOrder.notes && (
              <div className="mt-5 rounded-2xl bg-yellow-50 p-4">
                <p className="font-sans text-[10px] font-extrabold uppercase text-yellow-800">Customer Notes</p>
                <p className="mt-1 font-sans text-sm font-bold text-yellow-950">{selectedOrder.notes}</p>
              </div>
            )}

            <div className="mt-7">
              <h3 className="font-display text-xl font-bold text-primary">Fulfilment Timeline</h3>
              <ol className="mt-4 space-y-4">
                {timeline.map(event => (
                  <li key={event.id} className="flex gap-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-800"><CheckCircle2 className="h-3.5 w-3.5" /></span>
                    <span>
                      <span className="block font-sans text-sm font-extrabold text-primary">{event.label}</span>
                      <span className="mt-0.5 block font-sans text-[11px] font-bold text-outline">
                        {['system:payment', 'stripe'].includes(event.actingUserId) ? 'Payment provider' : 'Store team'} · {formatTimePlaced(event.createdAt)}
                      </span>
                    </span>
                  </li>
                ))}
                {timeline.length === 0 && <li className="font-sans text-sm font-bold text-on-surface-variant">Timeline is loading.</li>}
              </ol>
            </div>

            {selectedOrder.payment.status === 'paid' && (
              <div className="mt-7 rounded-2xl border border-green-200 bg-green-50 p-4 text-green-900">
                <p className="font-sans text-sm font-extrabold">Payment confirmed ✓</p>
                <p className="mt-1 font-sans text-xs font-bold">Next: Send customer confirmation via WhatsApp</p>
              </div>
            )}

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              {canReviewPayments && selectedOrder.payment.status === 'pending_verification' && (
                <>
                  {selectedOrder.payment.receiptPath && (
                    <button type="button" disabled={isUpdating} onClick={() => storeOrderService.openReceipt(selectedOrder.payment.receiptPath).catch(error => setErrorMessage(error.message))} className="rounded-full bg-surface-container px-5 py-3 font-sans text-xs font-extrabold text-primary disabled:opacity-50">View Receipt</button>
                  )}
                  <button type="button" disabled={isUpdating} onClick={() => reviewPayment('approve')} className="rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary disabled:opacity-50">Confirm Payment</button>
                  <button type="button" disabled={isUpdating} onClick={() => reviewPayment('reject')} className="rounded-full bg-error/10 px-5 py-3 font-sans text-xs font-extrabold text-error disabled:opacity-50">Reject Payment</button>
                </>
              )}
              {selectedOrder.fulfilments && <section aria-label="Fulfilment schedule" className="w-full space-y-3">{selectedOrder.fulfilments.map(day => {
                const operation = selectedOrder.fulfilmentOperations?.[day.id];
                const complete = Boolean(selectedOrder.fulfilmentCompletion?.[day.id]);
                const ticket = getOrderTickets(selectedOrder).find(ticket => ticket.fulfilmentId === day.id);
                const next = ticket ? nextDailyStatus(selectedOrder,ticket) : null;
                const dispatchStatus = operation?.dispatch?.status || 'not_requested';
                const deliveryIssues = canonicalFulfilmentMethod(selectedOrder, day) === 'delivery' && !selectedOrder.manualOrder ? resolveDeliveryDispatchData(selectedOrder, day).issues : [];
                const canAct = canProcessOrders && selectedOrder.payment.status === 'paid' && !['Completed', 'Cancelled'].includes(selectedOrder.fulfilmentStatus);
                return <div key={day.id} className="rounded-xl bg-surface-container-low p-3 text-sm font-bold text-primary"><p>{ticket?.date || day.date} · {ticket?.time || day.time} · {ticket?.method || day.method} · {ticket?.method === 'delivery' ? ticket.address || 'Delivery address missing' : day.pickupLocationName}</p>{deliveryIssues.length > 0 && <p role="alert">{deliveryBlockedMessage(deliveryIssues)}</p>}{ticket?.method === 'delivery' && operation?.kitchenStatus !== 'Ready' && !complete && <p>Mark this paid delivery day Ready before requesting Lalamove.</p>}{day.allocations.map((allocation, index) => { const item = selectedOrder.items[allocation.itemIndex]; const meal = allocation.componentDay ? item?.weeklyPlanSnapshot?.meals.find(meal => meal.day === allocation.componentDay) : item; return <div key={index}><p>{allocation.quantity} × {meal?.productName}</p><MealOptionSummary snapshot={allocation.componentDay ? item?.weeklyPlanSnapshot?.meals.find(meal => meal.day === allocation.componentDay) : item?.healthyLunchSnapshot} /></div>; })}
                  {complete ? <span>Completed</span> : canAct && <><p>{operation?.kitchenStatus || 'New'}</p>{next && <button type="button" disabled={isUpdating} onClick={() => updateStatus(next, undefined, day.id)} className="m-2 rounded-full bg-primary px-4 py-2 text-on-primary">{next === 'Preparing' ? 'Prepare' : `Mark ${next}`} {day.date}</button>}{next === 'Preparing' && <button type="button" disabled={isUpdating} onClick={() => updateStatus('Ready', undefined, day.id)} className="m-2 rounded-full bg-primary px-4 py-2 text-on-primary">Mark Ready {day.date}</button>}{day.method === 'delivery' && !selectedOrder.manualOrder && <div><p>{operation?.kitchenStatus || 'Scheduled'} · {dispatchStatus} · {operation?.lifecycle?.state || ''}</p>{operation?.providerOrder?.orderId && <p>Lalamove: {operation.providerOrder.orderId}</p>}{operation?.providerOrder?.shareLink && <a href={operation.providerOrder.shareLink} target="_blank" rel="noreferrer" className="underline">Track delivery</a>}{operation?.providerOrder?.driver && <p>Rider: {operation.providerOrder.driver.name} · {operation.providerOrder.driver.phone} · {operation.providerOrder.driver.plateNumber}</p>}
                    {operation?.kitchenStatus === 'Ready' && ['not_requested', 'failed'].includes(dispatchStatus) && <button type="button" disabled={isUpdating || deliveryIssues.length > 0} onClick={() => dispatchDelivery(selectedOrder.id, day.id)} className="m-2 rounded-full bg-primary px-4 py-2 text-on-primary">Request Lalamove</button>}
                    {['creating', 'created', 'outcome_unknown', 'cancel_requested'].includes(dispatchStatus) && <button type="button" disabled={isUpdating} onClick={() => refreshDelivery(selectedOrder.id, day.id)} className="m-2 rounded-full border px-4 py-2">Refresh dispatch</button>}
                    {dispatchStatus === 'created' && <button type="button" disabled={isUpdating} onClick={() => cancelDelivery(selectedOrder.id, day.id)} className="m-2 rounded-full border px-4 py-2">Cancel dispatch</button>}
                    {operation?.dispatch?.errorCode && <p role="alert">Dispatch: {operation.dispatch.errorCode}{operation.dispatch.fields?.length ? ` Fields: ${operation.dispatch.fields.join(', ')}` : ''}{operation.dispatch.requestId ? ` Request ID: ${operation.dispatch.requestId}` : ''}</p>}
                    {dispatchStatus === 'outcome_unknown' && <p role="alert">Provider submission outcome is uncertain. Reconcile the existing request before any replacement dispatch.</p>}
                  </div>}</>}
                </div>;
              })}</section>}
              {!selectedOrder.fulfilments && getOrderTickets(selectedOrder).some(ticket => ticket.weeklyDay || ticket.fulfilmentId) && <section aria-label="Legacy daily schedule" className="w-full space-y-2">{getOrderTickets(selectedOrder).map(ticket => {
                const complete = Boolean(ticket.fulfilmentId ? selectedOrder.fulfilmentCompletion?.[ticket.fulfilmentId] : selectedOrder.weeklyCompletion?.[ticket.weeklyDay as NonNullable<typeof ticket.weeklyDay>]);
                const status = selectedOrder.fulfilmentOperations?.[ticket.fulfilmentId || ticket.weeklyDay || '']?.kitchenStatus || 'New';
                const next = nextDailyStatus(selectedOrder,ticket);
                return <div key={ticket.key} className="rounded-xl bg-surface-container-low p-3 text-sm font-bold text-primary"><p>{ticket.date} · {ticket.time} · {ticket.method} · {complete ? 'Completed' : status}</p>{ticket.items.map((item,index) => <p key={index}>{item.quantity} × {item.name}</p>)}{!complete && canProcessOrders && selectedOrder.payment.status === 'paid' && !['Completed','Cancelled'].includes(selectedOrder.fulfilmentStatus) && next && <button type="button" disabled={isUpdating} onClick={() => updateStatus(next,ticket.weeklyDay,ticket.fulfilmentId)} className="mt-2 rounded-full bg-primary px-4 py-2 text-on-primary">{next === 'Preparing' ? 'Prepare' : `Mark ${next}`} {ticket.date}</button>}{!complete && canProcessOrders && next === 'Preparing' && <button type="button" disabled={isUpdating} onClick={() => updateStatus('Ready',ticket.weeklyDay,ticket.fulfilmentId)} className="m-2 rounded-full bg-primary px-4 py-2 text-on-primary">Mark Ready {ticket.date}</button>}</div>;
              })}</section>}
              {!getOrderTickets(selectedOrder).length && <p role="status">Schedule review required. Purchased item dates are missing or inconsistent.</p>}
              {canProcessOrders
                && !selectedOrder.weeklyFulfilments && !selectedOrder.fulfilments
                && getOrderTickets(selectedOrder).length > 0 && !getOrderTickets(selectedOrder).some(ticket => ticket.fulfilmentId)
                && isOrderOperationallyEligible(selectedOrder)
                && NEXT_STATUS[selectedOrder.fulfilmentStatus as StoreFulfilmentStatus] && (
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={() => updateStatus(NEXT_STATUS[selectedOrder.fulfilmentStatus as StoreFulfilmentStatus]!)}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary disabled:opacity-50"
                >
                  <Clock3 className="h-4 w-4" />
                  Mark {NEXT_STATUS[selectedOrder.fulfilmentStatus as StoreFulfilmentStatus]}
                </button>
              )}
              {selectedOrder.delivery?.dispatch?.status === 'outcome_unknown' && <p role="alert">Delivery submission outcome is uncertain. Reconcile the existing request before requesting a replacement.</p>}
              {canProcessOrders && selectedOrder.fulfilmentMethod === 'delivery' && !selectedOrder.fulfilments && selectedOrder.delivery?.lifecycle?.state !== 'completed' && !['created', 'creating', 'outcome_unknown', 'cancel_requested', 'provider_terminal', 'cancelled'].includes(selectedOrder.delivery?.dispatch?.status || '') && ((selectedOrder.delivery?.fulfilmentMode === 'instant' && ['Preparing', 'Ready'].includes(selectedOrder.fulfilmentStatus)) || (selectedOrder.delivery?.fulfilmentMode !== 'instant' && selectedOrder.fulfilmentStatus === 'Ready')) && (
                <button type="button" disabled={isUpdating} onClick={() => dispatchDelivery(selectedOrder.id)} className="mt-3 w-full rounded-full bg-secondary px-5 py-3 font-sans text-xs font-extrabold text-on-secondary disabled:opacity-50">{selectedOrder.delivery?.fulfilmentMode === 'instant' ? 'Find Driver' : 'Request Lalamove delivery'}</button>
              )}
              {selectedOrder.fulfilmentMethod === 'delivery' && !selectedOrder.fulfilments && <div className="mt-3 rounded-xl bg-surface-container-low p-3 text-sm font-bold text-primary"><p>Delivery: {deliveryLifecycleLabel(selectedOrder.delivery?.lifecycle?.state)}</p>{selectedOrder.delivery?.lifecycle?.state === 'assigning_driver' && deliveryElapsed(selectedOrder.delivery.lifecycle.history) && <p className="mt-1 text-xs">Searching for {deliveryElapsed(selectedOrder.delivery.lifecycle.history)}</p>}{selectedOrder.delivery?.providerOrder?.driver?.name && <p className="mt-1 text-xs">Driver: {selectedOrder.delivery.providerOrder.driver.name}{selectedOrder.delivery.providerOrder.driver.plateNumber ? ` · ${selectedOrder.delivery.providerOrder.driver.plateNumber}` : ''}</p>}{selectedOrder.delivery?.providerOrder?.driver?.phone && <p className="mt-1 text-xs">{selectedOrder.delivery.providerOrder.driver.phone}</p>}{selectedOrder.delivery?.providerOrder?.shareLink && <a className="mt-2 inline-block text-xs underline" href={selectedOrder.delivery.providerOrder.shareLink} target="_blank" rel="noreferrer">Track delivery</a>}{['expired', 'rejected', 'canceled'].includes(selectedOrder.delivery?.lifecycle?.state || '') && <p className="mt-2 text-xs">Merchant review required. A replacement is never created automatically.</p>}</div>}
              {canProcessOrders && selectedOrder.fulfilmentMethod === 'delivery' && !selectedOrder.fulfilments && activeDeliveryLifecycle(selectedOrder.delivery?.lifecycle?.state) && <button type="button" disabled={isUpdating} onClick={() => refreshDelivery(selectedOrder.id)} className="mt-3 rounded-full border border-outline px-5 py-3 font-sans text-xs font-extrabold text-primary disabled:opacity-50">Refresh delivery</button>}
              {canProcessOrders && selectedOrder.fulfilmentMethod === 'delivery' && !selectedOrder.fulfilments && ['assigning_driver', 'driver_assigned'].includes(selectedOrder.delivery?.lifecycle?.state || '') && <button type="button" disabled={isUpdating} onClick={() => cancelDelivery(selectedOrder.id)} className="mt-3 rounded-full border border-error px-5 py-3 font-sans text-xs font-extrabold text-error disabled:opacity-50">Cancel Lalamove delivery</button>}
              <WhatsAppCustomerButton
                order={selectedOrder}
                country={country}
                storeName={storeName}
                className="flex-1"
              />
              {canProcessOrders && !selectedOrder.weeklyFulfilments && !selectedOrder.fulfilments && selectedOrder.payment.refundStatus === 'refunded'
                && !['Completed', 'Cancelled'].includes(selectedOrder.fulfilmentStatus) && (
                <button type="button" disabled={isUpdating} onClick={() => updateStatus('Cancelled')} className="rounded-full bg-error/10 px-5 py-3 font-sans text-xs font-extrabold text-error disabled:opacity-50">
                  Mark Cancelled
                </button>
              )}
            </div>
          </article>
        ) : (
          <div className="hidden rounded-3xl border border-dashed border-outline-variant px-6 py-14 text-center lg:block">
            <ReceiptText className="mx-auto h-8 w-8 text-primary" />
            <p className="mt-3 font-sans text-sm font-bold text-on-surface-variant">Choose an order to see its details.</p>
          </div>
        )}
      </div>
    </section>
  );
}
