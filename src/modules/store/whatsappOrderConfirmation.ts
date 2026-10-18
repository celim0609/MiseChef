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
  fulfilmentMethod?: 'pickup' | 'delivery';
  fullAddress?: string;
  paymentAmount?: number;
  currency?: string;
  schedule?: Array<{ date: string; time: string; address?: string }>;
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
  storeName = '',
  fulfilmentMethod = 'pickup',
  fullAddress = '',
  paymentAmount,
  currency = 'MYR',
  schedule = []
}: Omit<WhatsAppOrderConfirmationInput, 'phone' | 'country'>) => {
  const delivery = fulfilmentMethod === 'delivery';
  const name = customerName.trim();
  const entries = schedule.length
    ? schedule
    : pickupDate.trim() || pickupTime.trim()
      ? [{ date: pickupDate, time: pickupTime, address: fullAddress }]
      : [];
  const address = fullAddress.trim() || (!delivery ? pickupLocation.trim() : '');
  const amount = typeof paymentAmount === 'number' && Number.isFinite(paymentAmount)
    ? `${currency === 'MYR' ? 'RM' : currency === 'SGD' ? 'SGD ' : currency + ' '}${paymentAmount.toFixed(2)} · Paid`
    : 'Paid';
  const lines = [
    '*Order Confirmed* ✅💚',
    '',
    name ? `Hi ${name}! Thank you for your order! 🥰` : 'Thank you for your order! 🥰',
    '',
    orderNumber.trim() ? `🧾 Order: *${orderNumber.trim()}*` : '',
    `💳 Payment: *${amount}*`,
    !delivery && pickupCode.trim() ? `🔑 Pickup Code: *${pickupCode.trim()}*` : '',
    '',
    delivery ? '🚚 *Delivery Schedule*' : '📅 *Pickup Schedule*',
    ...entries.map(entry => [entry.date.trim(), entry.time.trim()].filter(Boolean).join(' · ')),
    '',
    address ? `📍 *${delivery ? 'Delivery' : 'Pickup'} Address*\n${address}` : '',
    ...((new Set(entries.map(entry => entry.address?.trim()).filter(Boolean))).size > 1
      ? ['', '*Addresses by date*', ...entries.filter(entry => entry.address?.trim()).map(entry => `${entry.date}: ${entry.address}`)]
      : []),
    '',
    entries.length > 1 ? '💚 Please follow your selected dates & times.' : 'Freshly prepared for you! 💚',
    '',
    'Thank you!',
    storeName.trim() ? `*${storeName.trim()}*` : ''
  ];
  return lines.filter((line, index) => line !== '' || (index > 0 && lines[index - 1] !== '')).join('\n').trim();
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
