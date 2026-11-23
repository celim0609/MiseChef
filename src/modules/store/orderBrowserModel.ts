import { dailyStatus } from './dailyOrderModel';
import { getOrderTickets } from './orderTickets';
import { shiftDateKey } from './posOrderModel';
import type { StoreOrder } from './types';
export type BrowserPeriod = 'Today' | 'Tomorrow' | 'Upcoming' | 'History';
export type BrowserMode = 'Day' | 'Week' | 'Month';
export function browserRange(date: string, mode: BrowserMode) {
  if (mode === 'Day') return { start: date, end: shiftDateKey(date, 1) };
  if (mode === 'Month') {
    const start = `${date.slice(0, 7)}-01`;
    const next = new Date(`${start}T12:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    return { start, end: next.toISOString().slice(0, 10) };
  }
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const start = shiftDateKey(date, -((weekday + 6) % 7));
  return { start, end: shiftDateKey(start, 7) };
}
export function moveBrowserDate(date: string, mode: BrowserMode, direction: number) {
  const range = browserRange(date, mode);
  return direction > 0 ? range.end : mode === 'Month' ? browserRange(shiftDateKey(range.start, -1), mode).start : shiftDateKey(range.start, direction * (mode === 'Week' ? 7 : 1));
}
export function browserRows(orders: StoreOrder[], period: BrowserPeriod, today: string, range: { start: string; end: string }, search = '', payment = '', method = '') {
  const query = search.trim().toLowerCase();
  const rows = new Map<string, { order: StoreOrder; date: string; times: string[]; methods: string[]; statuses: string[] }>();
  for (const order of new Map(orders.map(order => [order.id, order])).values()) {
    if (payment && order.payment.status !== payment) continue;
    if (query && ![order.id, order.orderNumber, order.customerName].some(value => String(value || '').normalize('NFKC').toLowerCase().includes(query.normalize('NFKC')))) continue;
    for (const ticket of getOrderTickets(order)) {
      const status = dailyStatus(order, ticket);
      const terminal = ['Completed', 'Cancelled'].includes(status);
      const matchesPeriod = period === 'History' ? terminal || ticket.date < today : !terminal && (period === 'Today' ? ticket.date === today : period === 'Tomorrow' ? ticket.date === shiftDateKey(today, 1) : ticket.date > today);
      if (!matchesPeriod || (method && ticket.method !== method)) continue;
      if ((period === 'History' || period === 'Upcoming') && (ticket.date < range.start || ticket.date >= range.end)) continue;
      const key = `${ticket.date}:${order.id}`;
      const row = rows.get(key) || { order, date: ticket.date, times: [], methods: [], statuses: [] };
      if (ticket.time && !row.times.includes(ticket.time)) row.times.push(ticket.time);
      if (!row.methods.includes(ticket.method)) row.methods.push(ticket.method);
      if (!row.statuses.includes(status)) row.statuses.push(status);
      rows.set(key, row);
    }
  }
  return [...rows.values()].sort((a, b) => (period === 'History' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)) || a.times.join().localeCompare(b.times.join()) || a.order.orderNumber.localeCompare(b.order.orderNumber));
}

export function selectedBrowserRange(period: BrowserPeriod, date: string, mode: BrowserMode, today: string) {
  if (period === 'Today' || period === 'Tomorrow') return browserRange(period === 'Today' ? today : shiftDateKey(today, 1), 'Day');
  return browserRange(date, mode);
}
