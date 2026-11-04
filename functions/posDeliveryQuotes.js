import { createHash, randomUUID } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { buildExternalOrderItems } from './externalPosOrderModel.js';
import { buildLalamoveQuoteRequest, quoteSnapshot, validateDestination, assertFutureLalamoveSchedule } from './storeDelivery.js';
import { calculateDeliveryDayPricing } from './storeDeliveryPricing.js';

const fail = message => { throw new HttpsError('failed-precondition', message); };
const money = value => Math.round((value + Number.EPSILON) * 100) / 100;
export const posSlotKey = day => `${day.date}_${day.time}`;
export const posDeliveryBinding = (input, checkout, built) => createHash('sha256').update(JSON.stringify({
  storeId: checkout.store.id, workspaceId: checkout.store.workspaceId, currency: checkout.store.currency,
  items: built.items, fulfilments: built.fulfilments,
  delivery: checkout.store.delivery, destination: input.destination || null,
  destinations: input.deliveryDestinations || {},
})).digest('hex');
const validMoney = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100000 && money(value) === value;

// POS reuses canonical items, schedules, provider requests and fee policy. It does not
// use public advance-order validation and never invokes a booking operation.
export async function createPosDeliveryQuote({ db, uid, input, provider, authorize, loadCheckout, resolvePlace, now = new Date() }) {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to estimate delivery.');
  const base = await loadCheckout(db, input?.slug);
  if (input.workspaceId !== base.store.workspaceId || input.storeId !== base.store.id) throw new HttpsError('permission-denied', 'Store ownership mismatch.');
  const fullAccess = await authorize({ db, uid, workspaceId: input.workspaceId, posFullAccess: true });
  const checkout = fullAccess ? await loadCheckout(db, input.slug, { includeUnavailable: true }) : base;
  if (checkout.store.id !== base.store.id || checkout.store.workspaceId !== base.store.workspaceId) throw new HttpsError('permission-denied', 'Store ownership mismatch.');
  const catalog = fullAccess ? { ...checkout, products: checkout.products.map(p => ({ ...p, available: true })) } : checkout;
  if (input.fulfilmentMethod !== 'delivery') fail('Choose Delivery to estimate a fee.');
  if (!Array.isArray(input.selections) || !input.selections.length || input.selections.length > 50) fail('Choose 1–50 cart lines.');
  const built = buildExternalOrderItems(input, catalog, now, { owner: fullAccess });
  const config = checkout.store.delivery;
  if (checkout.store.currency !== 'MYR' || !config?.enabled || config.provider !== 'lalamove' || config.market !== 'MY' || config.environment !== provider.environment || !config.serviceType) fail('Lalamove quotation is unavailable for this Store.');
  const pickup = config.pickup;
  validateDestination({ formattedAddress: pickup?.address, latitude: pickup?.latitude, longitude: pickup?.longitude });
  if (!built.fulfilments?.length || built.fulfilments.length > 20) fail('Use a manual delivery fee for more than 20 delivery schedules.');
  // Validate all schedules before requesting any provider quote (including mixed historical weeks).
  for (const day of built.fulfilments) assertFutureLalamoveSchedule({ mode: 'preorder', date: day.date, time: day.time }, now.getTime());
  const resolved = new Map();
  const dayQuotes = [];
  for (const day of built.fulfilments) {
    const choice = input.deliveryDestinations?.[day.date] || input.destination;
    if (!choice?.placeId || typeof choice.placeId !== 'string' || choice.placeId.length > 300) fail('Select a Malaysian delivery location, or use a manual fee when address search is unavailable.');
    if (!resolved.has(choice.placeId)) resolved.set(choice.placeId, await resolvePlace(choice.placeId));
    const pin = resolved.get(choice.placeId);
    // Address corrections never change the server-resolved Places pin.
    const destination = validateDestination({ ...choice, latitude: pin.latitude, longitude: pin.longitude });
    const quote = quoteSnapshot(await provider.createQuote(buildLalamoveQuoteRequest({ config, pickup, destination, schedule: { mode: 'preorder', date: day.date, time: day.time } })));
    if (!quote.quotationId || quote.currency !== 'MYR' || !validMoney(quote.fee) || !Number.isFinite(Date.parse(quote.expiresAt)) || Date.parse(quote.expiresAt) <= now.getTime() + 5000) fail('Lalamove returned an invalid or expired quotation.');
    dayQuotes.push({ key: posSlotKey(day), date: day.date, time: day.time, destination, quote });
  }
  // The existing policy allocates package cents across service days. Slot keys also
  // distinguish two fulfilment times on the same date without changing the schedule.
  const pricing = calculateDeliveryDayPricing({ config, pickup, destination: dayQuotes[0].destination, providerFee: dayQuotes[0].quote.fee,
    items: built.items.map(item => ({ ...item, ...(item.mealOptionDays ? { mealOptionDays: built.fulfilments.flatMap(day => item.mealOptionDays.filter(option => option.serviceDate === day.date).map(option => ({ ...option, serviceDate: posSlotKey(day) }))) } : {}) })),
    fulfilments: built.fulfilments.map(day => ({ ...day, date: posSlotKey(day) })),
    dayQuotes: dayQuotes.map(day => ({ ...day, date: day.key })),
    promotionPricing: { discountedMerchandiseTotal: money(built.items.reduce((sum, item) => sum + item.lineTotal, 0)), promotionSnapshot: { lineAdjustments: built.items.map(item => ({ finalLineTotal: item.lineTotal })) } },
  });
  const days = dayQuotes.map(day => ({ ...day, ...pricing.days.find(price => price.date === day.key), date: day.date }));
  const id = randomUUID();
  const snapshot = { uid, workspaceId: input.workspaceId, storeId: input.storeId, binding: posDeliveryBinding(input, checkout, built),
    expiresAt: new Date(Math.min(...dayQuotes.map(day => Date.parse(day.quote.expiresAt)))).toISOString(),
    customerDeliveryFee: pricing.customerDeliveryFee, providerDeliveryFee: money(days.reduce((sum, day) => sum + day.providerDeliveryFee, 0)),
    days, currency: 'MYR', createdAt: now.toISOString(), purpose: 'pos_estimate_only', environment: provider.environment };
  await db.collection('storePosDeliveryQuotes').doc(id).create(snapshot);
  return { id, expiresAt: snapshot.expiresAt, customerDeliveryFee: snapshot.customerDeliveryFee, providerDeliveryFee: snapshot.providerDeliveryFee, currency: 'MYR',
    days: days.map(({ date, time, customerDeliveryFee, freeDeliveryApplied }) => ({ date, time, customerDeliveryFee, freeDeliveryApplied })) };
}

export async function resolvePosDeliveryCharge({ db, transaction, input, checkout, built, uid, fullAccess, now }) {
  if (input.fulfilmentMethod !== 'delivery') {
    if (input.deliveryFeeOverride || input.posDeliveryQuoteId) fail('Remove the delivery fee before switching to Pickup.');
    return { fee: 0 };
  }
  if (input.deliveryFeeOverride !== undefined) {
    if (!fullAccess) throw new HttpsError('permission-denied', 'Only Owner or Manager can override a delivery fee.');
    for (const day of built?.fulfilments || []) {
      const choice = input.deliveryDestinations?.[day.date] || input.destination;
      const address = choice ? choice.formattedAddress : input.deliveryAddress;
      if (typeof address !== 'string' || !address.trim() || address.length > 1000) fail('Enter a delivery address for every delivery date.');
    }
    const { amount, reason } = input.deliveryFeeOverride || {};
    if (!validMoney(amount) || typeof reason !== 'string' || !reason.trim() || reason.trim().length > 240) fail('Enter a valid manual delivery fee and reason.');
    return { fee: amount, snapshot: { mode: 'manual_override', customerDeliveryFee: amount, providerDeliveryFee: null, currency: checkout.store.currency || 'MYR', reason: reason.trim(), authorizedBy: uid, createdAt: now.toISOString() } };
  }
  if (typeof input.posDeliveryQuoteId !== 'string' || !/^[a-zA-Z0-9-]{16,100}$/.test(input.posDeliveryQuoteId)) fail('Refresh the delivery estimate or enter an authorized manual fee.');
  const saved = (await transaction.get(db.collection('storePosDeliveryQuotes').doc(input.posDeliveryQuoteId))).data();
  if (!saved || saved.uid !== uid || saved.workspaceId !== input.workspaceId || saved.storeId !== input.storeId || saved.purpose !== 'pos_estimate_only' || saved.currency !== checkout.store.currency
    || saved.binding !== posDeliveryBinding(input, checkout, built) || !Number.isFinite(Date.parse(saved.expiresAt)) || Date.parse(saved.expiresAt) <= now.getTime() + 5000
    || !validMoney(saved.customerDeliveryFee) || !validMoney(saved.providerDeliveryFee)) fail('Delivery estimate expired or order details changed. Refresh the estimate.');
  return { fee: saved.customerDeliveryFee, snapshot: { ...saved, quoteSnapshotId: input.posDeliveryQuoteId, mode: 'quoted_estimate' } };
}
