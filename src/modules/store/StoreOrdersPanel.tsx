import { useEffect, useMemo, useState } from 'react';
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
import { storeOrderService } from './services';
import { formatPickupDateLabel } from './storeModel';
import { isOrderOperationallyEligible } from './posOrderModel';
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

interface StoreOrdersPanelProps {
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
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [timeline, setTimeline] = useState<StoreOrderTimelineEvent[]>([]);
  const [activeFilter, setActiveFilter] = useState<(typeof FILTERS)[number]>('All');
  const [isUpdating, setIsUpdating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => storeOrderService.subscribeOrders(
    workspaceId,
    setOrders,
    error => setErrorMessage(error.message || 'Unable to load orders.')
  ), [workspaceId]);

  useEffect(() => {
    if (focusOrderId && orders.some(order => order.id === focusOrderId)) {
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

  const visibleOrders = useMemo(() => orders.filter(order => {
    if (activeFilter === 'All') return true;
    if (activeFilter === 'Payment Review') return order.payment.status === 'pending_verification';
    if (activeFilter === 'Paid') return order.payment.status === 'paid';
    if (activeFilter === 'New') {
      return order.payment.status === 'paid' && order.fulfilmentStatus === 'New';
    }
    return order.fulfilmentStatus === activeFilter;
  }), [activeFilter, orders]);

  const updateStatus = async (nextStatus: StoreFulfilmentStatus) => {
    if (!selectedOrder || isUpdating) return;
    setIsUpdating(true);
    setErrorMessage('');
    try {
      await storeOrderService.updateFulfilment(selectedOrder.id, nextStatus);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update this order.');
    } finally {
      setIsUpdating(false);
    }
  };

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

      <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Order filters">
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
                  {order.pickupCode && <span className="mt-1 block font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-secondary">Pickup {order.pickupCode}</span>}
                  <span className="mt-1 block font-sans text-sm font-extrabold text-on-surface">{order.customerName}</span>
                </span>
                <span className="rounded-full bg-surface-container px-3 py-1.5 font-sans text-[10px] font-extrabold text-primary">
                  {order.payment.status === 'pending_verification'
                    ? 'Payment Review'
                    : order.fulfilmentStatus || paymentStatusLabel(order.payment.status)}
                </span>
              </span>
              <span className="mt-4 grid gap-2 font-sans text-xs font-bold text-on-surface-variant sm:grid-cols-2">
                <span>{formatPickupDateLabel(order.pickupDate, country)}</span>
                <span>{order.pickupSession}</span>
                <span>{order.pickupLocationName}</span>
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
              <div><dt className="font-sans text-[10px] font-extrabold uppercase text-outline">Pickup Date</dt><dd className="mt-1 font-sans text-sm font-extrabold text-primary">{formatPickupDateLabel(selectedOrder.pickupDate, country)}</dd></div>
              <div><dt className="font-sans text-[10px] font-extrabold uppercase text-outline">Pickup Session</dt><dd className="mt-1 font-sans text-sm font-extrabold text-primary">{selectedOrder.pickupSession}</dd></div>
              <div className="sm:col-span-2"><dt className="font-sans text-[10px] font-extrabold uppercase text-outline">Pickup Location</dt><dd className="mt-1 inline-flex items-start gap-1.5 font-sans text-sm font-extrabold text-primary"><MapPin className="mt-0.5 h-3.5 w-3.5" /> {selectedOrder.pickupLocationName}</dd></div>
              <div><dt className="font-sans text-[10px] font-extrabold uppercase text-outline">Payment</dt><dd className="mt-1 font-sans text-sm font-extrabold text-primary">{paymentStatusLabel(selectedOrder.payment.status)}</dd></div>
              <div><dt className="font-sans text-[10px] font-extrabold uppercase text-outline">Payment Method</dt><dd className="mt-1 font-sans text-sm font-extrabold text-primary">{selectedOrder.paymentMethodName}</dd></div>
              <div><dt className="font-sans text-[10px] font-extrabold uppercase text-outline">Fulfilment</dt><dd className="mt-1 font-sans text-sm font-extrabold text-primary">{selectedOrder.fulfilmentStatus || 'Not started'}</dd></div>
            </dl>

            <div className="mt-6 space-y-3">
              {selectedOrder.items.map((item, itemIndex) => (
                <div key={`${selectedOrder.id}_${item.productId}_${itemIndex}`} className="rounded-2xl border border-surface-container-high p-4">
                  <div className="flex justify-between gap-4">
                    <div>
                      <h3 className="font-sans text-sm font-extrabold text-primary">{item.quantity} × {item.productName}</h3>
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
                          <span>{option.groupName}: {option.optionName}</span>
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
              {canProcessOrders
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
              <WhatsAppCustomerButton
                order={selectedOrder}
                country={country}
                storeName={storeName}
                className="flex-1"
              />
              {canProcessOrders && selectedOrder.payment.refundStatus === 'refunded'
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
