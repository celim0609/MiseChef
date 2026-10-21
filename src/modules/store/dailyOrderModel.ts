import { isOrderOperationallyEligible, shiftDateKey } from './posOrderModel';
import type { StoreOrder } from './types';
import { getOrderTickets, type OrderTicket } from './orderTickets';
export function dailyStatus(order: StoreOrder, ticket: OrderTicket): StoreOrder['fulfilmentStatus'] {
  if (order.fulfilmentStatus === 'Cancelled') return 'Cancelled';
  if (order.fulfilmentStatus === 'Completed' || (ticket.fulfilmentId ? order.fulfilmentCompletion?.[ticket.fulfilmentId] : ticket.weeklyDay ? order.weeklyCompletion?.[ticket.weeklyDay] : false)) return 'Completed';
  const operation = order.fulfilmentOperations?.[ticket.fulfilmentId || ticket.weeklyDay || '']?.kitchenStatus;
  return operation === 'Preparing' || operation === 'Ready' ? operation : (ticket.fulfilmentId || ticket.weeklyDay ? 'New' : order.fulfilmentStatus);
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

export type DailyView = 'Today' | 'Tomorrow' | 'Upcoming' | 'History';
export function ticketInDailyView(date: string, view: DailyView, today: string) {
  return view === 'Upcoming' ? date > today : view === 'Tomorrow' ? date === shiftDateKey(today,1) : view === 'History' ? date < today : date === today;
}
export function dailyEntries(orders: StoreOrder[], view: DailyView, today: string) {
  return [...new Map(orders.map(order => [order.id,order])).values()].filter(isOrderOperationallyEligible).flatMap(order => getOrderTickets(order).filter(ticket => {
    if (view !== 'History' && !ticket.fulfilmentId && !ticket.weeklyDay) return false;
    const terminal = ['Completed','Cancelled'].includes(dailyStatus(order,ticket));
    return view === 'History' ? terminal || ticket.date < today : !terminal && ticketInDailyView(ticket.date,view,today);
  }).map(ticket => ({order,ticket,status:dailyStatus(order,ticket)}))).sort((a,b) => `${a.ticket.date} ${a.ticket.time}`.localeCompare(`${b.ticket.date} ${b.ticket.time}`) || a.ticket.key.localeCompare(b.ticket.key));
}
export function dailyActions(order: StoreOrder, ticket: OrderTicket): Exclude<StoreOrder['fulfilmentStatus'], ''>[] {
 const next = nextDailyStatus(order,ticket);
 return next === 'Preparing' ? ['Preparing','Ready'] : next ? [next] : [];
}

export function orderMatchesStatusInPeriod(order: StoreOrder, period: 'Today' | 'Upcoming' | 'History', filter: string, today: string) {
  if (!orderInPeriod(order, period, today)) return false;
  if (filter === 'All') return true;
  if (filter === 'Paid') return order.payment.status === 'paid';
  if (filter === 'Payment Review') return order.payment.status === 'pending_verification';
  if (filter === 'New' && order.payment.status !== 'paid') return false;
  const tickets = getOrderTickets(order);
  if (!tickets.length) return order.fulfilmentStatus === filter;
  return tickets.some(ticket => {
    const status = dailyStatus(order, ticket);
    const terminal = ['Completed', 'Cancelled'].includes(status);
    const inPeriod = period === 'History' ? terminal || ticket.date < today
      : !terminal && (period === 'Today' ? ticket.date === today : ticket.date > today);
    return inPeriod && status === filter;
  });
}


// Completed is a fulfilment-period summary, including completed days of active parents.
export function completedEntriesForPeriod(orders: StoreOrder[], view: DailyView, today: string) {
  return dailyEntries(orders, 'History', today).filter(entry => entry.status === 'Completed' && ticketInDailyView(entry.ticket.date, view, today));
}
