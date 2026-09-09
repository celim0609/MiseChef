import type { StoreFulfilmentStatus, StoreOrder } from './types';

export type CustomerOrderStatus =
  | 'Payment Pending'
  | 'Order Confirmed'
  | 'Preparing'
  | 'Ready for Pickup'
  | 'Completed'
  | 'Payment Rejected'
  | 'Cancelled';

type CustomerOrderStatusInput = {
  paymentStatus?: StoreOrder['payment']['status'] | string;
  fulfilmentStatus?: StoreFulfilmentStatus | string;
  orderStatus?: StoreOrder['status'] | string;
};

const normalized = (value?: string) => value?.trim().toLowerCase().replaceAll('_', ' ') || '';

export const getCustomerOrderStatus = ({
  paymentStatus,
  fulfilmentStatus,
  orderStatus
}: CustomerOrderStatusInput): CustomerOrderStatus => {
  const payment = normalized(paymentStatus);
  const fulfilment = normalized(fulfilmentStatus);
  const order = normalized(orderStatus);

  if (payment === 'rejected' || order === 'payment rejected') return 'Payment Rejected';
  if (payment === 'cancelled' || fulfilment === 'cancelled' || order === 'payment cancelled') return 'Cancelled';
  if (fulfilment === 'completed') return 'Completed';
  if (fulfilment === 'ready') return 'Ready for Pickup';
  if (fulfilment === 'preparing') return 'Preparing';
  if (payment === 'paid' || ['paid', 'confirmed'].includes(order) || fulfilment === 'confirmed') {
    return 'Order Confirmed';
  }
  return 'Payment Pending';
};
