import { MessageCircle } from 'lucide-react';
import type { RegionCode } from '../../regions';
import { formatPickupDateLabel } from './storeModel';
import type { StoreOrder } from './types';
import {
  canWhatsAppCustomer,
  getWhatsAppOrderConfirmation
} from './whatsappOrderConfirmation';

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
    pickupDate: order.pickupDate ? formatPickupDateLabel(order.pickupDate, country) : '',
    pickupTime: order.pickupSession,
    pickupLocation: order.pickupLocationName,
    pickupCode: order.pickupCode,
    storeName
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
