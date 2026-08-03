export const BULK_ORDER_MESSAGE = `Hi!

I'm interested in placing a bulk order.

Company:

Preferred Date:

Estimated Quantity:

Contact Name:

Thank you.`;

export const normalizeWhatsAppNumber = (value: string) => value.replace(/\D/g, '');

export const STORE_CHAT_MESSAGE = 'Hi! I have a question about your MiseChef Store.';

export const getStoreChatMessage = ({
  storeName,
  orderNumber
}: {
  storeName?: string;
  orderNumber?: string;
}) => {
  const safeStoreName = storeName?.trim();
  const safeOrderNumber = orderNumber?.trim();
  if (safeOrderNumber) {
    return `Hi! I need help with my ${safeStoreName || 'MiseChef Store'} order ${safeOrderNumber}.`;
  }
  return safeStoreName
    ? `Hi! I have a question about ${safeStoreName}.`
    : STORE_CHAT_MESSAGE;
};

export const isValidBusinessWhatsApp = (value: string) => {
  if (!value.trim()) return true;
  if (value.trim().length > 30) return false;
  const digits = normalizeWhatsAppNumber(value);
  return /^[+\d][\d\s()-]*$/.test(value.trim())
    && digits.length >= 8
    && digits.length <= 15;
};

export const getBusinessWhatsAppUrl = (
  value: string,
  message = BULK_ORDER_MESSAGE
) => {
  if (!value.trim() || !isValidBusinessWhatsApp(value)) return '';
  return `https://wa.me/${normalizeWhatsAppNumber(value)}?text=${encodeURIComponent(message)}`;
};

export const getStoreChatWhatsAppUrl = ({
  whatsapp,
  storeName,
  orderNumber
}: {
  whatsapp: string;
  storeName?: string;
  orderNumber?: string;
}) => getBusinessWhatsAppUrl(
  whatsapp,
  getStoreChatMessage({ storeName, orderNumber })
);

export const createCustomerOrderNumber = (
  now = new Date(),
  random = Math.random
) => {
  const date = now.toISOString().slice(2, 10).replace(/-/g, '');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const suffix = Array.from(
    { length: 6 },
    () => alphabet[Math.floor(random() * alphabet.length) % alphabet.length]
  ).join('');
  return `MC-${date}-${suffix}`;
};
