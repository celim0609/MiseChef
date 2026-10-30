import { canonicalFulfilmentView } from '../../../functions/storeFulfilmentCanonical.js';
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
    const view = canonicalFulfilmentView(order, entry);
    return { id: entry.id, date: view.date, time: view.time, method: view.method, address: view.address,
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
// Parse date-only values in UTC so the customer's saved day never shifts by timezone.
const messageDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Date not specified';
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return 'Date not specified';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'short'
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(entry => entry.type === type)?.value;
  return `${part('weekday')}, ${part('day')} ${part('month')}`;
};
const messageTime = (value: string) => {
  const clean = plainText(value);
  const clock = /^(\d{1,2}):(\d{2})(?::00)?$/.exec(clean);
  if (clock) {
    const hour = Number(clock[1]);
    if (hour > 23 || Number(clock[2]) > 59) return '';
    return `${hour % 12 || 12}:${clock[2]} ${hour < 12 ? 'AM' : 'PM'}`;
  }
  const twelveHour = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i.exec(clean);
  if (twelveHour) return Number(twelveHour[1]) >= 1 && Number(twelveHour[1]) <= 12 && Number(twelveHour[2] || '00') <= 59
    ? `${Number(twelveHour[1])}:${twelveHour[2] || '00'} ${twelveHour[3].toUpperCase()}` : '';
  // Keep saved session labels (for example Lunch), but never leak a raw timestamp.
  if (/\d{4}-\d{2}-\d{2}T/.test(clean)) return '';
  return clean.replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b(?!\s*[ap]m)/gi, (_, hour: string, minute: string) => {
    const h = Number(hour);
    return `${h % 12 || 12}:${minute} ${h < 12 ? 'AM' : 'PM'}`;
  });
};
const messageStatus = (value: string) => {
  const labels: Record<string, string> = {
    assigning_driver: 'Finding a driver', driver_assigned: 'Driver assigned',
    picked_up: 'On the way', completed: 'Completed', delivered: 'Delivered',
    canceled: 'Cancelled', cancelled: 'Cancelled', rejected: 'Delivery declined',
    expired: 'Delivery booking expired', created: 'Booking created',
    pending: 'Pending', new: 'Not started', preparing: 'Preparing your meals',
    ready: 'Ready', confirmed: 'Confirmed', paid: 'Paid'
  };
  return labels[value.toLowerCase()] || plainText(value) || 'Status unavailable';
};
export function customerActionMessage(order: StoreOrder, action: CustomerAction, date: string, today: string, storeName: string) {
  const schedule = customerMessageSchedule(order).filter(entry => action === 'confirm' || entry.date === (action === 'delivery' ? today : date));
  if (!schedule.length || (action !== 'confirm' && !(action === 'delivery' ? today : date))) return '';
  const brand = plainText(order.storeName || storeName);
  const customer = plainText(order.customerName);
  const intro = action === 'confirm' ? `Thank you for your order${brand ? ` with ${brand}` : ''}!`
    : action === 'reminder' ? `A friendly reminder about your order${brand ? ` from ${brand}` : ''}.`
      : `Here's the latest update on your order${brand ? ` from ${brand}` : ''}.`;
  const lines = [customer ? `Hi ${customer},` : 'Hi there,', '', intro];
  if (plainText(order.orderNumber)) lines.push(`Order number: ${plainText(order.orderNumber)}`);
  if (action === 'confirm') lines.push(order.payment.status === 'paid'
    ? 'Payment confirmed. Thank you!' : 'Payment has not been confirmed.');
  const methodLabel = (entry: MessageSchedule) => entry.method === 'delivery' ? 'Delivery' : 'Pickup';
  const times = schedule.map(entry => messageTime(entry.time));
  const addresses = schedule.map(entry => plainText(entry.address));
  const commonTime = times[0] && times.every(value => value === times[0]) ? times[0] : '';
  const commonAddress = addresses[0] && addresses.every(value => value === addresses[0]) ? addresses[0] : '';
  const sameMethod = schedule.every(entry => entry.method === schedule[0].method);
  const timeLabel = sameMethod ? `${methodLabel(schedule[0])} time` : 'Time';
  const addressLabel = sameMethod ? `${methodLabel(schedule[0])} address` : 'Address';
  const allDates = new Set(schedule.map(entry => entry.date)).size > 1 ? ' for all dates' : '';
  if (commonTime || commonAddress) lines.push('');
  if (commonTime) lines.push(`${timeLabel}${allDates}: ${commonTime}`);
  if (commonAddress) lines.push(`${addressLabel}${allDates}: ${commonAddress}`);
  const groups = new Map<string, MessageSchedule[]>();
  for (const entry of schedule) groups.set(entry.date, [...(groups.get(entry.date) || []), entry]);
  for (const [day, entries] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push('', messageDate(day));
    for (const entry of entries) {
      const method = methodLabel(entry);
      lines.push(method);
      if (!commonTime && messageTime(entry.time)) lines.push(`${method} time: ${messageTime(entry.time)}`);
      lines.push(...entry.items.map(item => `${item.quantity} x ${plainText(item.name)}`));
      if (!commonAddress && plainText(entry.address)) lines.push(`${method} address: ${plainText(entry.address)}`);
      if (action === 'delivery') {
        lines.push(`${method} status: ${messageStatus(entry.status)}`);
        if (entry.method === 'delivery' && entry.tracking) lines.push(`Track your delivery: ${entry.tracking}`);
      }
    }
  }
  if (order.pickupCode && schedule.some(entry => entry.method === 'pickup')) lines.push('', `Pickup code: ${plainText(order.pickupCode)}`);
  lines.push('', 'Thank you for choosing us. Enjoy your meals!', brand);
  return lines.join('\n').trim();
}
export function customerActionUrl(order: StoreOrder, country: RegionCode, message: string) {
  const phone = normalizeCustomerWhatsAppDestination(order.phone, country);
  return phone.ok && message ? `https://web.whatsapp.com/send?phone=${phone.destination}&text=${encodeURIComponent(message)}` : '';
}
