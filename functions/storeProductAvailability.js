// Shared by the Product editor, Store date picker, and authoritative order builder.
export const AVAILABLE_DAYS = ['all', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** @param {{ availableDay?: string }} product @param {string} date */
export const productAllowsFulfilmentDate = (product, date) => {
  const day = product.availableDay ?? 'all';
  if (day === 'all') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
    && WEEKDAYS[parsed.getUTCDay()] === day;
};

/**
 * Sets retain their existing flow; this feature applies to single products.
 * @param {Array<{productId: string, setId?: string}>} selections
 * @param {Array<{id: string, availableDay?: string}>} products
 * @param {string} date
 */
export const cartAllowsFulfilmentDate = (selections, products, date) => selections.every(selection =>
  selection.setId || productAllowsFulfilmentDate(products.find(product => product.id === selection.productId) || {}, date)
);

/** @param {string} timeZone @param {Date} [now] */
export const currentFulfilmentDate = (timeZone, now = new Date()) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};
