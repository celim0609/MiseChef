import type { StoreOrder } from './types';
import { getOrderTickets, type OrderTicket } from './orderTickets';
export function dailyStatus(order: StoreOrder, ticket: OrderTicket) {
  if (order.fulfilmentStatus === 'Cancelled') return 'Cancelled';
  if (order.fulfilmentStatus === 'Completed' || (ticket.fulfilmentId ? order.fulfilmentCompletion?.[ticket.fulfilmentId] : ticket.weeklyDay ? order.weeklyCompletion?.[ticket.weeklyDay] : false)) return 'Completed';
  return order.fulfilmentOperations?.[ticket.fulfilmentId || ticket.weeklyDay || '']?.kitchenStatus || (ticket.fulfilmentId || ticket.weeklyDay ? 'New' : order.fulfilmentStatus);
}
export function orderInPeriod(order: StoreOrder, period: 'Today' | 'Upcoming' | 'History', today: string) {
  if (['Cancelled', 'Completed'].includes(order.fulfilmentStatus)) return period === 'History';
  return getOrderTickets(order).some(ticket => {
    const terminal = ['Cancelled', 'Completed'].includes(dailyStatus(order, ticket));
    return period === 'History' ? terminal || ticket.date < today : !terminal && (period === 'Today' ? ticket.date === today : ticket.date > today);
  });
}
