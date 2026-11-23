// Read-only search projection. Never writes to canonical order/payment/delivery documents.
import { canonicalFulfilmentView } from './storeFulfilmentCanonical.js';
import { legacyDailyFulfilments } from './legacyDailyFulfilments.js';
export const HISTORY_INDEX_VERSION = 1;
export const normalizeHistorySearch = value => String(value || '').normalize('NFKC').toLowerCase().trim();
export function historySearchTerms(value) {
  const chars = Array.from(normalizeHistorySearch(value));
  return [...new Set(chars.flatMap((_, index) => [1, 2, 3].filter(size => index + size <= chars.length).map(size => chars.slice(index, index + size).join(''))))];
}
export function historySearchToken(value) { return Array.from(normalizeHistorySearch(value)).slice(0, 3).join(''); }
export function historyIndexRows(order, orderId) {
  if (order.deletedAt || !order.storeId || !order.workspaceId || (order.groupDelivery && !order.groupDelivery.releasedAt)) return [];
  let days = order.fulfilments?.length ? order.fulfilments.map(day => canonicalFulfilmentView(order, day))
    : order.weeklyFulfilments?.length ? order.weeklyFulfilments.map(day => ({date: day.date}))
    : legacyDailyFulfilments(order);
  if (!days) {
    if (order.items?.some(item => item.weeklyPlanSnapshot || item.healthyLunchSnapshot?.date)) return [];
    let date = order.delivery?.schedule?.date || order.pickupDate;
    if (!date && (order.externalOrder || order.delivery?.fulfilmentMode === 'instant')) {
      const created = order.createdAt?.toDate?.() || new Date(order.createdAt);
      if (Number.isFinite(created.getTime())) date = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Kuala_Lumpur', year:'numeric',month:'2-digit',day:'2-digit'}).format(created);
    }
    days = date ? [{date}] : [];
  }
  const searchValues = [orderId, order.orderNumber, order.customerName].map(normalizeHistorySearch);
  const searchTerms = [...new Set(searchValues.flatMap(historySearchTerms))];
  return [...new Set(days.map(day => day.date).filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date || '')))].map(date => ({
    orderId, storeId: order.storeId, workspaceId: order.workspaceId, date, searchValues, searchTerms, version: HISTORY_INDEX_VERSION
  }));
}
export async function syncPosHistoryIndex(db, orderId) {
  // Always reread the current order inside a transaction: retries/out-of-order events and backfills cannot restore stale search data.
  const ref = db.collection('storeOrders').doc(orderId);
  await db.runTransaction(async transaction => {
    const order = await transaction.get(ref);
    const old = await transaction.get(db.collection('storeOrderHistoryIndex').where('orderId','==',orderId));
    const rows = order.exists ? historyIndexRows(order.data(), orderId) : [];
    const currentIds = new Set(rows.map(row => `${orderId}__${row.date}`));
    for (const document of old.docs) if (!currentIds.has(document.id)) transaction.delete(document.ref);
    for (const row of rows) transaction.set(db.collection('storeOrderHistoryIndex').doc(`${orderId}__${row.date}`), row);
  });
}
