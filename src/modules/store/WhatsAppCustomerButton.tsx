import { MessageCircle } from 'lucide-react';
import type { RegionCode } from '../../regions';
import type { StoreOrder } from './types';
import {
  canWhatsAppCustomer,
  normalizeCustomerWhatsAppDestination
} from './whatsappOrderConfirmation';
import { customerActionMessage, customerActionUrl } from './customerCommunicationModel';

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
  const message = customerActionMessage(order, 'confirm', '', '', storeName);
  const href = customerActionUrl(order, country, message);
  const destination = normalizeCustomerWhatsAppDestination(order.phone, country);
  const sharedClasses = `inline-flex min-h-12 items-center justify-center gap-2 rounded-full border px-5 py-3 font-sans text-xs font-extrabold ${className}`;
  if (!href) {
    return (
      <span className="inline-flex flex-col gap-1">
        <button type="button" disabled className={`${sharedClasses} cursor-not-allowed border-outline-variant text-outline opacity-60`}>
          <MessageCircle className="h-4 w-4" /> WhatsApp Customer
        </button>
        <span role="alert" className="font-sans text-[11px] font-bold text-error">{destination.error || 'No order message is available.'}</span>
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`${sharedClasses} border-green-700 bg-white text-green-800`}
    >
      <MessageCircle className="h-4 w-4" /> WhatsApp Customer
    </a>
  );
}
