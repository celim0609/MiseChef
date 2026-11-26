import { canonicalFulfilmentView } from '../../../functions/storeFulfilmentCanonical.js';
import { legacyDailyFulfilments } from '../../../functions/legacyDailyFulfilments.js';
import { getStoreOrderBreakdown } from './storeOrderBreakdown';
import { formatRegionCurrency } from '../../regions';
import type { StoreOrder, StoreOrderItem, MealOptionSnapshot } from './types';
import type { RegionCode } from '../../regions';
import { normalizeCustomerWhatsAppDestination, whatsappStoreSignature } from './whatsappOrderConfirmation';

export type CustomerAction = 'confirm' | 'reminder' | 'delivery';
export type DeliveryProvider = 'Lalamove' | 'Grab' | 'Private Driver';
export interface DeliveryMessageOptions { provider: DeliveryProvider; tracking?: string }
interface MessageItem { name: string; quantity: number; remarks?: string[]; complimentary?: boolean }
export interface MessageSchedule {
  id: string; date: string; time: string; method: 'pickup' | 'delivery'; address: string;
  items: MessageItem[];
  remarks?: string[];
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

export const safeTracking = (value?: string) => {
  try { const url = new URL(value || ''); return url.protocol === 'https:' ? url.href : undefined; } catch { return undefined; }
};
const terminalMessageStatus = (order: StoreOrder, completed = false) => order.fulfilmentStatus === 'Cancelled' ? 'Cancelled'
  : order.fulfilmentStatus === 'Completed' || completed ? 'Completed' : undefined;

const remarks = (...values: Array<string | undefined>) => [...new Set(values.map(value => plainText(value)).filter(Boolean))];
const mealOptions = (meal?: MealOptionSnapshot) => meal?.selectedMealOptions?.map(option => `${option.optionGroupName}: ${option.optionName}`) ?? [];
const messageItem = (item: StoreOrderItem, quantity: number, includeCustomerNotes: boolean, meal?: MealOptionSnapshot & { productName: string }): MessageItem => ({
  name: plainText(meal?.productName || item.productName),
  quantity,
  complimentary: item.complimentary === true,
  remarks: remarks(includeCustomerNotes ? item.notes : undefined, ...mealOptions(meal ?? item.healthyLunchSnapshot),
    ...(item.selectedOptions ?? []).map(option => `${option.groupName}: ${option.optionName}${(option.quantity ?? 1) > 1 ? ` × ${option.quantity}` : ''}`),
    ...(item.setSnapshot?.selectedGroups ?? []).map(group => `${group.groupName}: ${group.productName}`))
});

// Staff-entered POS notes have no saved customer visibility flag.
const hasCustomerNotes = (order: StoreOrder) => order.orderSource === 'online'
  && order.hasSavedOnlineSource !== false && !order.manualOrder && !order.externalOrder;

export function customerMessageSchedule(order: StoreOrder): MessageSchedule[] {
  const includeCustomerNotes = hasCustomerNotes(order);
  const fulfilments = order.fulfilments?.length ? order.fulfilments : legacyDailyFulfilments(order) as StoreOrder['fulfilments'];
  if (fulfilments?.length) return fulfilments.map(entry => {
    const op = order.fulfilmentOperations?.[entry.id];
    const view = canonicalFulfilmentView(order, entry);
    return { id: entry.id, date: view.date, time: view.time, method: view.method,
      address: view.method === 'delivery' && entry.destination ? entry.destination.formattedAddress : view.address,
      remarks: remarks(view.method === 'delivery'
        ? entry.destination?.deliveryInstructions ?? order.delivery?.recipient?.instructions : undefined),
      items: entry.allocations.flatMap(allocation => {
        const item = order.items[allocation.itemIndex];
        const meal = item?.weeklyPlanSnapshot?.meals.find(m => m.day === allocation.componentDay);
        return item && (!allocation.componentDay || meal) ? [messageItem(item, allocation.quantity, includeCustomerNotes, meal)] : [];
      }),
      status: terminalMessageStatus(order, Boolean(order.fulfilmentCompletion?.[entry.id])) || op?.lifecycle?.state || op?.providerOrder?.status || op?.dispatch?.status || op?.kitchenStatus || 'Status unavailable',
      // Never reuse the parent delivery link/status for an independent date.
      tracking: safeTracking(op?.providerOrder?.shareLink)
    };
  });
  if (order.weeklyFulfilments?.length) return order.weeklyFulfilments.map(entry => ({
    id: entry.day, date: entry.date, time: entry.pickupTime, method: order.fulfilmentMethod === 'delivery' ? 'delivery' : 'pickup',
    address: order.fulfilmentMethod === 'delivery' ? order.delivery?.recipient?.address || '' : entry.pickupLocationAddress || entry.pickupLocationName,
    items: [{ name: plainText(entry.productName), quantity: entry.quantity, remarks: remarks(...mealOptions(entry)) }],
    status: terminalMessageStatus(order, Boolean(order.weeklyCompletion?.[entry.day])) || 'Status unavailable'
  }));
  const delivery = order.fulfilmentMethod === 'delivery' || order.delivery?.fulfilmentMethod === 'delivery';
  const hasUnresolvedSchedule = order.items?.some(item => item.healthyLunchSnapshot?.date || item.weeklyPlanSnapshot);
  return [{ id: 'single', date: hasUnresolvedSchedule ? '' : delivery ? order.delivery?.schedule?.date || order.pickupDate || '' : order.pickupDate,
    time: delivery ? order.delivery?.schedule?.time || order.delivery?.schedule?.session || '' : order.pickupTime || order.pickupSession,
    method: delivery ? 'delivery' : 'pickup', address: delivery ? order.delivery?.recipient?.address || '' : order.pickupLocationAddress || order.pickupLocationName,
    items: (order.items || []).map(item => messageItem(item, item.quantity, includeCustomerNotes)),
    remarks: remarks(delivery ? order.delivery?.recipient?.instructions : undefined),
    status: terminalMessageStatus(order) || (delivery ? order.delivery?.lifecycle?.state || order.delivery?.providerOrder?.status || order.delivery?.dispatch?.status || 'Status unavailable' : order.fulfilmentStatus || 'Status unavailable'),
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
export function customerActionMessage(order: StoreOrder, action: CustomerAction, date: string, today: string, storeName: string, deliveryOptions?: DeliveryMessageOptions) {
  const selectedDate = action === 'delivery' ? today : date;
  const schedule = customerMessageSchedule(order).filter(entry => action === 'confirm'
    || (selectedDate && entry.date === selectedDate && (action !== 'delivery' || entry.method === 'delivery')));
  if (!schedule.length) return '';
  const brand = plainText(order.storeName) || plainText(storeName);
  const customer = plainText(order.customerName);
  const pickupOnly = schedule.every(entry => entry.method === 'pickup');
  const paid = order.payment.status === 'paid';
  const title = action === 'confirm' ? (paid ? '✅ *Order Confirmation*' : '*Order Confirmation*')
    : action === 'delivery' ? '🚗 *Delivery Update*'
      : pickupOnly ? '📅 *Pickup Reminder*' : '📅 *Order Reminder*';
  const intro = action === 'confirm' ? 'Thanks for ordering with us!'
    : action === 'reminder' ? `A quick reminder about your ${pickupOnly ? 'pickup' : 'order'}.`
      : 'Here’s the latest on your delivery.';
  const lines = [title, '', customer ? `Hi ${customer}! 😊` : 'Hi there! 😊', intro];
  if (plainText(order.orderNumber)) lines.push(`🧾 Order number: ${plainText(order.orderNumber)}`);
  const breakdown = action === 'confirm' ? getStoreOrderBreakdown(order) : undefined;
  const money = (amount?: number) => amount !== undefined && breakdown?.currency && ['MYR', 'SGD'].includes(breakdown.currency)
    ? formatRegionCurrency(amount, breakdown.currency) : 'Not available';
  const dailyFees = breakdown?.dailyDeliveryFees ?? [];
  const hasDailyFees = dailyFees.some(day => day.amount !== undefined);
  if (breakdown) {
    const { subtotal, deliveryFee, discount, finalTotal } = breakdown;
    lines.push('', '💰 *Payment Summary*', `Payment status: ${order.payment.status.replaceAll('_', ' ')}`,
      `Subtotal: ${money(subtotal)}`, `${dailyFees.length ? 'Total Delivery Fee' : 'Delivery Fee'}: ${money(deliveryFee)}`);
    if (hasDailyFees) {
      for (const day of dailyFees.filter(fee => !schedule.some(entry => entry.date === fee.date))) {
        lines.push(`Delivery Fee · ${messageDate(day.date)}: ${money(day.amount)}`);
      }
    } else if (dailyFees.length) {
      lines.push('Daily delivery breakdown: Not available');
    }
    if (discount) lines.push(`Discounts: −${money(discount)}`);
    lines.push(`Final Total: ${money(finalTotal)}`);
    const promotions = remarks(...(order.promotionSnapshot?.appliedPromotions ?? []).map(promotion => promotion.name),
      order.promotionCodeSnapshot?.code);
    if (promotions.length) lines.push(`Promotions: ${promotions.join(', ')}`);
  }
  if (action === 'delivery' && deliveryOptions) lines.push(`Delivery provider: ${deliveryOptions.provider}`);
  const suppliedTracking = safeTracking(deliveryOptions?.tracking);
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
  if (commonTime) lines.push(`🕒 ${timeLabel}${allDates}: ${commonTime}`);
  if (commonAddress) lines.push(`📍 ${addressLabel}${allDates}: ${commonAddress}`);
  const groups = new Map<string, MessageSchedule[]>();
  for (const entry of schedule) groups.set(entry.date, [...(groups.get(entry.date) || []), entry]);
  const usedTracking = new Set<string>();
  for (const [day, entries] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push('', `📅 *${messageDate(day)}*`);
    const dayFee = hasDailyFees ? dailyFees.find(fee => fee.date === day) : undefined;
    if (dayFee) lines.push(`Delivery Fee: ${money(dayFee.amount)}`);
    for (const entry of entries) {
      const method = methodLabel(entry);
      lines.push(`🍱 *${method}*`);
      if (!commonTime && messageTime(entry.time)) lines.push(`🕒 ${method} time: ${messageTime(entry.time)}`);
      const items = new Map<string, MessageItem>();
      for (const item of entry.items) {
        const key = JSON.stringify([item.name, item.complimentary, item.remarks]);
        const previous = items.get(key);
        items.set(key, { ...item, quantity: (previous?.quantity ?? 0) + item.quantity });
      }
      for (const item of items.values()) {
        lines.push(`${item.complimentary ? '🍹 ' : '• '}${item.quantity} x ${item.name}${item.complimentary ? ' (complimentary)' : ''}`);
        if (item.remarks?.length) lines.push(`  ${item.remarks.join(' · ')}`);
      }
      for (const remark of entry.remarks ?? []) lines.push(`📝 Special request: ${remark}`);
      if (!commonAddress && plainText(entry.address)) lines.push(`📍 ${method} address: ${plainText(entry.address)}`);
      if (action === 'delivery') {
        if (!deliveryOptions || deliveryOptions.provider === 'Lalamove') {
          lines.push(`${method} status: ${messageStatus(entry.status)}`);
          if (!suppliedTracking && entry.tracking && !usedTracking.has(entry.tracking)) {
            lines.push(`Track your delivery: ${entry.tracking}`);
            usedTracking.add(entry.tracking);
          }
        }
      }
    }
  }
  if (action === 'delivery' && suppliedTracking) lines.push('', `Track your delivery: ${suppliedTracking}`);
  const customerRemarks = plainText(order.customerRemarks ?? (hasCustomerNotes(order) ? order.notes : ''));
  if (customerRemarks) lines.push('', `📝 Order remarks: ${customerRemarks}`);
  if (order.pickupCode && schedule.some(entry => entry.method === 'pickup')) lines.push('', `🔑 Pickup code: ${plainText(order.pickupCode)}`);
  lines.push('', 'Enjoy your meals! 💚');
  lines.push(whatsappStoreSignature(brand));
  return lines.join('\n').trim();
}
export function customerActionUrl(order: StoreOrder, country: RegionCode, message: string) {
  const phone = normalizeCustomerWhatsAppDestination(order.phone, country);
  return phone.ok && message ? `https://web.whatsapp.com/send?phone=${phone.destination}&text=${encodeURIComponent(message)}` : '';
}
