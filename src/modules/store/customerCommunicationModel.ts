import type { StoreOrder } from './types';
import type { RegionCode } from '../../regions';
import { normalizeCustomerWhatsAppDestination } from './whatsappOrderConfirmation';

export type CustomerAction = 'confirm' | 'reminder' | 'delivery';
export interface MessageSchedule {
  id: string; date: string; time: string; method: 'pickup' | 'delivery'; address: string;
  items: Array<{ name: string; quantity: number }>;
  status: string; tracking?: string;
}
// Strip presentation syntax without encoding customer content as HTML.
export const plainText = (value: string = '') => value
  .replace(/<[^>]*>/g, '')
  .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"').replace(/&#(?:39|x27);/gi, "'").replace(/&nbsp;/gi, ' ')
  .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code: string) => {
    const n = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
  })
  .replace(/&[a-z][a-z0-9]+;/gi, ' ')
  .replace(/[*_`~\uFFFD\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

const safeTracking = (value?: string) => {
  try { const url = new URL(value || ''); return url.protocol === 'https:' ? url.href : undefined; } catch { return undefined; }
};
export function customerMessageSchedule(order: StoreOrder): MessageSchedule[] {
  if (order.fulfilments?.length) return order.fulfilments.map(entry => {
    const op = order.fulfilmentOperations?.[entry.id];
    return { id: entry.id, date: entry.date, time: entry.time, method: entry.method,
      address: entry.method === 'delivery' ? order.delivery?.recipient?.address || '' : entry.pickupLocationAddress || entry.pickupLocationName,
      items: entry.allocations.flatMap(allocation => {
        const item = order.items[allocation.itemIndex];
        const meal = allocation.componentDay ? item?.weeklyPlanSnapshot?.meals.find(m => m.day === allocation.componentDay) : item;
        return meal ? [{ name: meal.productName, quantity: allocation.quantity }] : [];
      }),
      status: op?.lifecycle?.state || op?.providerOrder?.status || op?.dispatch?.status || op?.kitchenStatus || 'Status unavailable',
      // Never reuse the parent delivery link/status for an independent date.
      tracking: safeTracking(op?.providerOrder?.shareLink)
    };
  });
  if (order.weeklyFulfilments?.length) return order.weeklyFulfilments.map(entry => ({
    id: entry.day, date: entry.date, time: entry.pickupTime, method: order.fulfilmentMethod === 'delivery' ? 'delivery' : 'pickup',
    address: order.fulfilmentMethod === 'delivery' ? order.delivery?.recipient?.address || '' : entry.pickupLocationAddress || entry.pickupLocationName,
    items: [{ name: entry.productName, quantity: entry.quantity }],
    status: order.weeklyCompletion?.[entry.day] ? 'Completed' : 'Status unavailable'
  }));
  const delivery = order.fulfilmentMethod === 'delivery';
  return [{ id: 'single', date: delivery ? order.delivery?.schedule?.date || '' : order.pickupDate,
    time: delivery ? order.delivery?.schedule?.time || order.delivery?.schedule?.session || '' : order.pickupTime || order.pickupSession,
    method: delivery ? 'delivery' : 'pickup', address: delivery ? order.delivery?.recipient?.address || '' : order.pickupLocationAddress || order.pickupLocationName,
    items: (order.items || []).map(item => ({ name: item.productName, quantity: item.quantity })),
    status: delivery ? order.delivery?.lifecycle?.state || order.delivery?.providerOrder?.status || order.delivery?.dispatch?.status || 'Status unavailable' : order.fulfilmentStatus || 'Status unavailable',
    tracking: delivery ? safeTracking(order.delivery?.providerOrder?.shareLink) : undefined
  }];
}
export function customerActionMessage(order: StoreOrder, action: CustomerAction, date: string, today: string, storeName: string) {
  const schedule = customerMessageSchedule(order).filter(entry => action === 'confirm' || entry.date === (action === 'delivery' ? today : date));
  if (!schedule.length || (action !== 'confirm' && !(action === 'delivery' ? today : date))) return '';
  const lines = [action === 'confirm' ? 'Order Confirmation' : action === 'reminder' ? 'Order Reminder' : 'Delivery Update', '',
    `Hi ${plainText(order.customerName)},`, `Order: ${plainText(order.orderNumber)}`];
  if (action === 'confirm') lines.push(order.payment.status === 'paid' ? 'Payment confirmed: Paid' : `Payment status: ${plainText(order.payment.status)} (not confirmed)`);
  if (order.createdAt) lines.push(`Order placed: ${plainText(order.createdAt)}`);
  for (const entry of schedule) {
    lines.push('', `Date: ${plainText(entry.date) || 'Not scheduled'}`, `${entry.method === 'delivery' ? 'Delivery' : 'Pickup'} time: ${plainText(entry.time) || 'Not specified'}`,
      ...entry.items.map(item => `${item.quantity} x ${plainText(item.name)}`));
    if (entry.address) lines.push(`Address: ${plainText(entry.address)}`);
    if (action === 'delivery') {
      lines.push(`${entry.method === 'delivery' ? 'Delivery' : 'Pickup'} status: ${plainText(entry.status)}`);
      if (entry.method === 'delivery' && entry.tracking) lines.push(`Lalamove tracking: ${entry.tracking}`);
    }
  }
  if (order.pickupCode && schedule.some(entry => entry.method === 'pickup')) lines.push('', `Pickup code: ${plainText(order.pickupCode)}`);
  lines.push('', plainText(order.storeName || storeName));
  return lines.join('\n').trim();
}
export function customerActionUrl(order: StoreOrder, country: RegionCode, message: string) {
  const phone = normalizeCustomerWhatsAppDestination(order.phone, country);
  return phone.ok && message ? `https://web.whatsapp.com/send?phone=${phone.destination}&text=${encodeURIComponent(message)}` : '';
}
