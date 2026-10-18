import { MessageCircle } from 'lucide-react';
import type { RegionCode } from '../../regions';
import type { StoreOrder } from './types';
import {
  canWhatsAppCustomer,
  getWhatsAppOrderConfirmation
} from './whatsappOrderConfirmation';

const formatConfirmationDate = (date: string, country: RegionCode) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return new Intl.DateTimeFormat(country === 'MY' ? 'en-MY' : 'en-SG', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'
  }).format(new Date(`${date}T00:00:00Z`));
};

export default function WhatsAppCustomerButton({
  order,
  country,
  storeName,
  className = ''
}: {
  order: StoreOrder;
  country: RegionCode;
  storeName: string;
  className?: string;
}) {
  if (!canWhatsAppCustomer(order)) return null;
  const confirmation = getWhatsAppOrderConfirmation({
    phone: order.phone,
    country,
    customerName: order.customerName,
    orderNumber: order.orderNumber,
    pickupDate: order.pickupDate ? formatConfirmationDate(order.pickupDate, country) : '',
    pickupTime: order.pickupTime || order.pickupSession,
    pickupLocation: order.pickupLocationName,
    fulfilmentMethod: order.fulfilmentMethod === 'delivery' ? 'delivery' : 'pickup',
    fullAddress: order.fulfilmentMethod === 'delivery' ? order.delivery?.recipient?.address || '' : order.pickupLocationAddress || order.pickupLocationName,
    paymentAmount: Number.isFinite(order.payment.amountMinor) ? order.payment.amountMinor / 100 : undefined,
    paymentStatus: order.payment.status,
    currency: order.payment.currency || order.currency,
    ...(order.fulfilmentMethod === 'delivery' ? {
      pickupDate: order.delivery?.schedule?.date ? formatConfirmationDate(order.delivery.schedule.date, country) : '',
      pickupTime: order.delivery?.schedule?.time || order.delivery?.schedule?.session || ''
    } : {}),
    schedule: order.fulfilments?.map(entry => ({
      date: entry.date ? formatConfirmationDate(entry.date, country) : '',
      time: entry.time,
      address: entry.method === 'delivery' ? order.delivery?.recipient?.address || '' : entry.pickupLocationAddress
    })),
    pickupCode: order.pickupCode,
    storeName: order.storeName || storeName
  });
  const sharedClasses = `inline-flex min-h-12 items-center justify-center gap-2 rounded-full border px-5 py-3 font-sans text-xs font-extrabold ${className}`;
  if (!confirmation.ok) {
    return (
      <span className="inline-flex flex-col gap-1">
        <button type="button" disabled className={`${sharedClasses} cursor-not-allowed border-outline-variant text-outline opacity-60`}>
          <MessageCircle className="h-4 w-4" /> WhatsApp Customer
        </button>
        <span role="alert" className="font-sans text-[11px] font-bold text-error">{confirmation.error}</span>
      </span>
    );
  }
  return (
    <a
      href={confirmation.url}
      target="_blank"
      rel="noreferrer"
      className={`${sharedClasses} border-green-700 bg-white text-green-800`}
    >
      <MessageCircle className="h-4 w-4" /> WhatsApp Customer
    </a>
  );
}
