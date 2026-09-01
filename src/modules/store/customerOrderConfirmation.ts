import type { PublicStoreOrderResult } from './types';
import { getCustomerOrderStatus, type CustomerOrderStatus } from './customerOrderStatus';

export type CustomerOrderConfirmationCopy = {
  heading: CustomerOrderStatus;
  message: string;
  statusLabel: CustomerOrderStatus;
};

export const getCustomerOrderConfirmationCopy = (
  paymentStatus: PublicStoreOrderResult['paymentStatus'],
  orderStatus?: PublicStoreOrderResult['status']
): CustomerOrderConfirmationCopy => {
  const statusLabel = getCustomerOrderStatus({ paymentStatus, orderStatus });
  if (paymentStatus === 'pending_verification') {
    return {
      heading: statusLabel,
      message: 'Your payment proof was submitted. The Store is confirming it now, and you do not need to pay again.',
      statusLabel
    };
  }
  if (paymentStatus === 'paid') {
    return {
      heading: statusLabel,
      message: 'Your payment was received and your order is confirmed.',
      statusLabel
    };
  }
  return {
    heading: statusLabel,
    message: orderStatus === 'Confirmed'
      ? 'Your order is confirmed. Please pay when you collect it.'
      : 'Your order was submitted and is waiting for payment confirmation.',
    statusLabel
  };
};
