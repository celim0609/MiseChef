import type { PublicStoreOrderResult } from './types';

export type CustomerOrderConfirmationCopy = {
  heading: 'Order Successfully Submitted' | 'Payment Proof Submitted' | 'Payment Confirmed';
  message: string;
  paymentLabel: string;
};

export const getCustomerOrderConfirmationCopy = (
  paymentStatus: PublicStoreOrderResult['paymentStatus']
): CustomerOrderConfirmationCopy => {
  if (paymentStatus === 'pending_verification') {
    return {
      heading: 'Payment Proof Submitted',
      message: 'Your order has been received. We are verifying your payment. You do not need to pay again.',
      paymentLabel: 'Payment verification pending'
    };
  }
  if (paymentStatus === 'paid') {
    return {
      heading: 'Payment Confirmed',
      message: 'Your payment was received and your order is confirmed.',
      paymentLabel: 'Paid'
    };
  }
  return {
    heading: 'Order Successfully Submitted',
    message: 'Your order is confirmed. Please pay when you collect it.',
    paymentLabel: 'Cash on pickup'
  };
};
