import { MessageCircle } from 'lucide-react';
import { getStoreChatWhatsAppUrl } from './selling';

interface StoreContactButtonProps {
  whatsapp: string;
  storeName?: string;
  orderNumber?: string;
  className?: string;
}

export default function StoreContactButton({
  whatsapp,
  storeName,
  orderNumber,
  className = ''
}: StoreContactButtonProps) {
  const url = getStoreChatWhatsAppUrl({ whatsapp, storeName, orderNumber });
  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-green-700 px-5 py-3 font-sans text-xs font-extrabold text-white transition hover:bg-green-800 ${className}`}
    >
      <MessageCircle className="h-4 w-4" />
      Chat with Store
    </a>
  );
}
