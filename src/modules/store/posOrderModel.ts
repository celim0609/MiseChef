import type { StoreOrder } from './types';

export type ActivePosStatus = 'New' | 'Preparing' | 'Ready';
export type OrderHistoryFilter = 'all' | 'completed' | 'cancelled' | 'paid' | 'pending';

export const MALAYSIA_TIME_ZONE = 'Asia/Kuala_Lumpur';

export const toActivePosStatus = (
  status: StoreOrder['fulfilmentStatus']
): ActivePosStatus | null => {
  if (status === 'New' || status === 'Preparing' || status === 'Ready') return status;
  if (status === 'Paid' || status === 'Confirmed') return 'New';
  return null;
};

export const countActiveOnlineOrders = (orders: StoreOrder[]) => orders.filter(
  order => order.orderSource === 'online' && toActivePosStatus(order.fulfilmentStatus)
).length;

export const toMalaysiaDateKey = (value: Date | string | number = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MALAYSIA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || '';
  return `${read('year')}-${read('month')}-${read('day')}`;
};

export const shiftDateKey = (dateKey: string, days: number) => {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return dateKey;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export const getMalaysiaDateRange = (dateKey: string) => ({
  start: new Date(`${dateKey}T00:00:00+08:00`),
  end: new Date(`${shiftDateKey(dateKey, 1)}T00:00:00+08:00`)
});

export const formatMalaysiaBusinessDate = (dateKey: string) => new Intl.DateTimeFormat('en-MY', {
  timeZone: MALAYSIA_TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric'
}).format(new Date(`${dateKey}T12:00:00+08:00`));

export const filterHistoryOrders = (
  orders: StoreOrder[],
  filter: OrderHistoryFilter,
  search: string
) => {
  const normalizedSearch = search.trim().toLowerCase();
  return orders.filter(order => {
    const matchesFilter = filter === 'all'
      || (filter === 'completed' && order.fulfilmentStatus === 'Completed')
      || (filter === 'cancelled' && order.fulfilmentStatus === 'Cancelled')
      || (filter === 'paid' && order.payment.status === 'paid')
      || (filter === 'pending' && ['pending', 'pending_verification', 'processing'].includes(order.payment.status));
    const matchesSearch = !normalizedSearch
      || order.orderNumber.toLowerCase().includes(normalizedSearch)
      || order.id.toLowerCase().includes(normalizedSearch);
    return matchesFilter && matchesSearch;
  });
};
