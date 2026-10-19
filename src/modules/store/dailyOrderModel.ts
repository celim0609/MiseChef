import type { StoreOrder } from './types';
import { getOrderTickets, type OrderTicket } from './orderTickets';
export function dailyStatus(order: StoreOrder, ticket: OrderTicket) {
  if (order.fulfilmentStatus === 'Cancelled') return 'Cancelled';
  if (order.fulfilmentStatus === 'Completed' || (ticket.fulfilmentId ? order.fulfilmentCompletion?.[ticket.fulfilmentId] : ticket.weeklyDay ? order.weeklyCompletion?.[ticket.weeklyDay] : false)) return 'Completed';
  return order.fulfilmentOperations?.[ticket.fulfilmentId || ticket.weeklyDay || '']?.kitchenStatus || (ticket.fulfilmentId || ticket.weeklyDay ? 'New' : order.fulfilmentStatus);
}
export function orderInPeriod(order: StoreOrder, period: 'Today' | 'Upcoming' | 'History', today: string) {
  if (['Cancelled', 'Completed'].includes(order.fulfilmentStatus)) return period === 'History';
  const tickets = getOrderTickets(order);
  if (!tickets.length) return period === 'History';
  return tickets.some(ticket => {
    const terminal = ['Cancelled', 'Completed'].includes(dailyStatus(order, ticket));
    return period === 'History' ? terminal || ticket.date < today : !terminal && (period === 'Today' ? ticket.date === today : ticket.date > today);
  });
}

export function sortOrdersForPeriod(orders: StoreOrder[], period: 'Today' | 'Upcoming' | 'History', today: string) {
  const key = (order: StoreOrder) => getOrderTickets(order).filter(ticket => {
    const terminal = ['Completed', 'Cancelled'].includes(dailyStatus(order, ticket));
    return period === 'Today' ? ticket.date === today && !terminal : period === 'Upcoming' ? ticket.date > today && !terminal : terminal || ticket.date < today;
  }).map(ticket => `${ticket.date}T${ticket.time}`).sort()[0] || '9999';
  return [...orders].sort((a,b) => key(a).localeCompare(key(b)) || (a.createdAt || '').localeCompare(b.createdAt || ''));
}

export function nextDailyStatus(order: StoreOrder, ticket: OrderTicket): StoreOrder['fulfilmentStatus'] | null {
  if (order.payment.status !== 'paid') return null;
  const status = dailyStatus(order,ticket);
  if (status === 'New' || status === 'Paid' || status === 'Confirmed') return 'Preparing';
  if (status === 'Preparing') return 'Ready';
  if (status === 'Ready' && (ticket.method === 'pickup' || order.manualOrder)) return 'Completed';
  return null;
}
