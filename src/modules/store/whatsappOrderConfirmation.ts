import type { RegionCode } from '../../regions';
import type { StoreOrder } from './types';

export interface WhatsAppOrderConfirmationInput {
  phone: string;
  country: RegionCode;
  customerName?: string;
  orderNumber?: string;
  pickupDate?: string;
  pickupTime?: string;
  pickupLocation?: string;
  pickupCode?: string;
  storeName?: string;
}

export type WhatsAppDestinationResult =
  | { ok: true; destination: string; error: '' }
  | { ok: false; destination: ''; error: string };

const INVALID_PHONE_MESSAGE = 'Customer phone number cannot be opened in WhatsApp.';

export const normalizeCustomerWhatsAppDestination = (
  phone: string,
  country: RegionCode
): WhatsAppDestinationResult => {
  const raw = phone.trim();
  if (!raw || !/^[+\d\s()-]+$/.test(raw)) {
    return { ok: false, destination: '', error: INVALID_PHONE_MESSAGE };
  }
  const digits = raw.replace(/\D/g, '');
  if (country === 'MY') {
    if (/^01\d{8,9}$/.test(digits)) {
      return { ok: true, destination: `60${digits.slice(1)}`, error: '' };
    }
    if (/^601\d{8,9}$/.test(digits)) {
      return { ok: true, destination: digits, error: '' };
    }
  }
  if (country === 'SG') {
    if (/^[689]\d{7}$/.test(digits)) {
      return { ok: true, destination: `65${digits}`, error: '' };
    }
    if (/^65[689]\d{7}$/.test(digits)) {
      return { ok: true, destination: digits, error: '' };
    }
  }
  return { ok: false, destination: '', error: INVALID_PHONE_MESSAGE };
};

export const buildWhatsAppOrderConfirmationMessage = ({
  customerName = '',
  orderNumber = '',
  pickupDate = '',
  pickupTime = '',
  pickupLocation = '',
  pickupCode = '',
  storeName = ''
}: Omit<WhatsAppOrderConfirmationInput, 'phone' | 'country'>) => {
  const greeting = customerName.trim()
    ? `Hi ${customerName.trim()}, your order has been confirmed.`
    : 'Your order has been confirmed.';
  const details = [
    orderNumber.trim() ? `Order: *${orderNumber.trim()}*` : '',
    pickupDate.trim() ? `Pickup: *${pickupDate.trim()}*` : '',
    pickupTime.trim() ? `Time: *${pickupTime.trim()}*` : '',
    pickupLocation.trim() ? `Location: *${pickupLocation.trim()}*` : ''
  ].filter(Boolean);
  const pickupCodeLine = pickupCode.trim() ? [`Pickup Code: *${pickupCode.trim()}*`] : [];
  const signOff = ['Thank you!', storeName.trim() ? `*${storeName.trim()}*` : ''].filter(Boolean);
  return [
    '✅ *Order Confirmed*',
    '',
    greeting,
    ...(details.length ? ['', ...details] : []),
    ...(pickupCodeLine.length ? ['', ...pickupCodeLine] : []),
    '',
    ...signOff
  ].join('\n');
};

export const getWhatsAppOrderConfirmation = (input: WhatsAppOrderConfirmationInput) => {
  const destination = normalizeCustomerWhatsAppDestination(input.phone, input.country);
  const message = buildWhatsAppOrderConfirmationMessage(input);
  return {
    ...destination,
    message,
    url: destination.ok
      ? `https://wa.me/${destination.destination}?text=${encodeURIComponent(message)}`
      : ''
  };
};

export const canWhatsAppCustomer = (order: Pick<StoreOrder, 'payment' | 'fulfilmentStatus'>) => (
  order.payment.status === 'paid'
  && order.payment.refundStatus === 'none'
  && order.fulfilmentStatus !== 'Cancelled'
);
