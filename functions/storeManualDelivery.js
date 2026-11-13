import { randomUUID, createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { fulfilmentContext, quoteSnapshot, buildLalamoveQuoteRequest, malaysiaPreorderScheduleAt, dispatchFulfilmentDelivery, refreshFulfilmentDelivery } from './storeDelivery.js';
import { canonicalFulfilmentView, resolveDeliveryDispatchData, deliveryBlockedMessage } from './storeFulfilmentCanonical.js';

const blocked = message => new HttpsError('failed-precondition', message);
const minor = amount => Math.round(amount * 100);
const validFee = amount => Number.isFinite(amount) && amount >= 0;
const bookingPricing = (order, entry, fee) => {
  const snapshot = order.deliveryPricingSnapshot;
  const day = (snapshot?.days || order.delivery?.pricing?.days)?.find(price => price.date === entry.date);
  const customerDeliveryFee = day?.customerDeliveryFee ?? (order.fulfilments.length === 1
    ? order.totals?.deliveryFee ?? order.delivery?.pricing?.customerDeliveryFee
    : snapshot?.fulfilmentCount === order.fulfilments.length ? snapshot.firstDayFee : undefined);
  const baseline = day?.providerDeliveryFee;
  const protectedTrip = Number.isInteger(day?.maximumExtraCostMinor) && day.maximumExtraCostMinor >= 0
    && Number.isInteger(day.collectedBufferMinor) && day.collectedBufferMinor >= 0;
  // Use the accepted trip policy so later settings edits cannot change paid bookings.
  const maximumExtraCostMinor = protectedTrip ? day.maximumExtraCostMinor : 500;
  const collectedBuffer = protectedTrip && validFee(baseline) && validFee(customerDeliveryFee)
    ? Math.min(day.collectedBufferMinor, Math.max(0, minor(customerDeliveryFee) - minor(baseline))) : 0;
  const extraCostMinor = validFee(baseline) ? minor(fee) - minor(baseline) - collectedBuffer : null;
  return {
    customerDeliveryFee: validFee(customerDeliveryFee) ? customerDeliveryFee : null,
    estimatedStoreBalance: validFee(customerDeliveryFee) ? (minor(customerDeliveryFee) - minor(fee)) / 100 : null,
    maximumExtraCost: maximumExtraCostMinor / 100,
    limitExceeded: extraCostMinor !== null && extraCostMinor > maximumExtraCostMinor,
  };
};
const fingerprint = (order, entry, resolved, fee) => createHash('sha256').update(JSON.stringify({
  entry, resolved, environment: order.delivery?.environment, pricing: bookingPricing(order, entry, fee),
})).digest('hex');
const assertReady = (order, entry) => {
  if (order.groupDelivery || order.manualOrder || order.payment?.status !== 'paid' || ['Completed', 'Cancelled'].includes(order.fulfilmentStatus) || order.fulfilmentCompletion?.[entry.id] || order.fulfilmentOperations?.[entry.id]?.kitchenStatus !== 'Ready') throw blocked('Only paid, Ready delivery fulfilments can request Lalamove.');
};
const assertUnbooked = operation => {
  if (operation?.providerOrder?.orderId || !['not_requested', 'failed'].includes(operation?.dispatch?.status || 'not_requested')) throw blocked('An existing or uncertain booking is locked. Reconcile it before requesting a replacement.');
};
const context = (args, ownerManagerOnly = false) => {
  if (!args.fulfilmentId || args.internal) throw blocked('Choose a saved delivery day. Legacy orders without daily fulfilments require a reviewed compatibility migration; no booking was submitted.');
  return fulfilmentContext({ ...args, internal: false, ownerManagerOnly });
};

export const previewMerchantDelivery = async args => {
  const { ref, order, entry, key } = await context(args, true);
  assertReady(order, entry); assertUnbooked(order.fulfilmentOperations?.[entry.id]);
  const resolved = resolveDeliveryDispatchData(order, entry);
  if (resolved.issues.length) throw blocked(deliveryBlockedMessage(resolved.issues));
  const view = canonicalFulfilmentView(order, entry);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(view.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(view.time)) throw blocked('Verify the saved delivery date and time before requesting a quotation.');
  const schedule = { mode: 'preorder', date: view.date, time: view.time };
  const future = Date.parse(malaysiaPreorderScheduleAt(schedule)) > Date.now();
  const quote = quoteSnapshot(await args.provider.createQuote(buildLalamoveQuoteRequest({ config: { serviceType: resolved.serviceType }, pickup: resolved.pickup, destination: resolved.recipient, schedule: future ? schedule : { mode: 'instant' } })));
  if (!quote.quotationId || quote.serviceType !== resolved.serviceType || quote.currency !== 'MYR' || !Number.isFinite(quote.fee) || quote.fee < 0 || quote.stops.length !== 2 || quote.stops.some(stop => !stop.stopId) || !(Date.parse(quote.expiresAt) > Date.now() + 5000)) throw blocked('The provider returned an incomplete or expired quotation. Request a new quotation.');
  const pricing = bookingPricing(order, entry, quote.fee);
  const preview = { ...pricing, id: randomUUID(), requestedBy: args.uid, fingerprint: fingerprint(order, entry, resolved, quote.fee), quote, expiresAt: quote.expiresAt, serviceType: resolved.serviceType, pickupAddress: resolved.pickup.address, dropoffAddress: resolved.recipient.address, date: view.date, time: view.time, scheduledPickupAt: future ? malaysiaPreorderScheduleAt(schedule) : null, bookingTime: future ? `${view.date} ${view.time} MYT` : 'Immediate pickup (saved delivery slot has elapsed)', estimatedCost: quote.fee, currency: quote.currency };
  await args.db.runTransaction(async transaction => {
    const latest = (await transaction.get(ref)).data();
    const day = latest.fulfilments?.find(day => day.id === entry.id);
    if (!day || fingerprint(latest, day, resolveDeliveryDispatchData(latest, day), quote.fee) !== preview.fingerprint) throw blocked('Delivery details changed. Request a new quotation.');
    assertReady(latest, day); assertUnbooked(latest.fulfilmentOperations?.[entry.id]);
    transaction.update(ref, { [`${key}.bookingPreview`]: preview });
  });
  // This action only quotes; it never creates a provider order or alters charges.
  const { fingerprint: _fingerprint, requestedBy: _requestedBy, quote: _quote, ...display } = preview;
  return { ...display, quotationId: quote.quotationId };
};

export const confirmMerchantDelivery = async args => {
  if (args.confirmed !== true || typeof args.previewId !== 'string' || !args.previewId) throw blocked('Review the quotation and explicitly confirm the Lalamove booking first.');
  const { order, entry } = await context(args, true);
  const operation = order.fulfilmentOperations?.[entry.id];
  // A repeated confirmation can only return the existing result, never resubmit.
  if (operation?.dispatch?.previewId === args.previewId && ['creating', 'created', 'outcome_unknown', 'completed', 'cancel_requested', 'cancelled', 'provider_terminal'].includes(operation.dispatch.status)) return { status: operation.dispatch.status, ...(operation.providerOrder?.orderId ? { orderId: operation.providerOrder.orderId } : {}) };
  const preview = operation?.bookingPreview;
  const validate = (latest, day, resolved) => {
    const current = latest.fulfilmentOperations?.[day.id]?.bookingPreview;
    assertReady(latest, day);
    if (!preview || current?.used || current?.id !== args.previewId || preview.id !== args.previewId || preview.requestedBy !== args.uid || !(Date.parse(preview.expiresAt) > Date.now() + 5000) || (preview.scheduledPickupAt && Date.parse(preview.scheduledPickupAt) <= Date.now()) || preview.fingerprint !== fingerprint(latest, day, resolved, preview.quote.fee)) throw blocked('Quotation expired or delivery details changed. Request and review a new quotation.');
    const pricing = bookingPricing(latest, day, preview.quote.fee);
    if (pricing.limitExceeded) throw blocked(`Lalamove exceeds the Maximum Extra Cost of MYR ${pricing.maximumExtraCost.toFixed(2)}. No booking was submitted.`);
  };
  validate(order, entry, resolveDeliveryDispatchData(order, entry));
  const current = quoteSnapshot(await args.provider.retrieveQuote({ market: 'MY', quotationId: preview.quote.quotationId }));
  if (current.quotationId !== preview.quote.quotationId || current.fee !== preview.quote.fee
    || current.currency !== preview.quote.currency || current.serviceType !== preview.quote.serviceType
    || !(Date.parse(current.expiresAt) > Date.now() + 5000)
    || current.stops.length !== preview.quote.stops.length
    || current.stops.some((stop, index) => stop.stopId !== preview.quote.stops[index].stopId)) {
    throw blocked('Lalamove quotation changed or expired. Request and review a new quotation.');
  }
  return dispatchFulfilmentDelivery({ ...args, internal: false, ownerManagerOnly: true, approvedQuote: current, validateConfirmation: validate, confirmationPreviewId: preview.id });
};

export const reconcileMerchantDelivery = async args => {
  const { ref, order, entry, key } = await context(args);
  const operation = order.fulfilmentOperations?.[entry.id] || {};
  if (operation.providerOrder?.orderId) return refreshFulfilmentDelivery(args);
  if (operation.dispatch?.status !== 'outcome_unknown') throw blocked('This fulfilment has no uncertain submission to reconcile.');
  // Older releases conservatively locked even explicit wallet rejections. This
  // trusted server-recorded provider response proves that no order was accepted.
  // Reconciliation only unlocks; a new preview and confirmation are still required.
  if (!args.providerOrderId && operation.dispatch?.providerCode === 'ERR_INSUFFICIENT_CREDIT' && operation.dispatch.requestId && operation.dispatch.operationalQuote?.quotationId) {
    await args.db.runTransaction(async transaction => {
      const current = (await transaction.get(ref)).data()?.fulfilmentOperations?.[entry.id];
      if (current?.dispatch?.status !== 'outcome_unknown' || current.providerOrder?.orderId || current.dispatch.providerCode !== 'ERR_INSUFFICIENT_CREDIT' || current.dispatch.requestId !== operation.dispatch.requestId) throw blocked('Dispatch changed. Refresh before reconciling.');
      transaction.update(ref, { [`${key}.dispatch.status`]: 'failed', [`${key}.dispatch.reconciliation`]: { result: 'confirmed_provider_rejection', providerCode: 'ERR_INSUFFICIENT_CREDIT', requestId: current.dispatch.requestId, reconciledBy: args.uid, reconciledAt: new Date().toISOString() }, [`${key}.dispatch.errorCode`]: 'Lalamove wallet has insufficient credit. Top up the correct account, then request and confirm a new quotation.', activeFulfilmentDeliveries: true, updatedAt: FieldValue.serverTimestamp() });
    });
    return { status: 'failed', resolution: 'confirmed_provider_rejection' };
  }
  // Other historical errors without trustworthy proof stay locked.
  const providerOrderId = typeof args.providerOrderId === 'string' ? args.providerOrderId.trim() : '';
  if (!providerOrderId) throw blocked('No booking ID is recorded. Check Lalamove order history or contact support using the Request ID. Enter the existing booking ID to verify it. Do not create a replacement while the outcome is uncertain.');
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(providerOrderId)) throw blocked('Enter a valid Lalamove booking ID.');
  const detail = await args.provider.retrieveOrder({ market: 'MY', orderId: providerOrderId });
  const quoteId = operation.dispatch?.operationalQuote?.quotationId;
  if (!quoteId || detail?.quotationId !== quoteId || (detail.orderId && detail.orderId !== providerOrderId)) throw blocked('The booking does not match this fulfilment quotation. The dispatch remains locked; contact Lalamove support with the Request ID.');
  await args.db.runTransaction(async transaction => {
    const fresh = (await transaction.get(ref)).data(); const current = fresh.fulfilmentOperations?.[entry.id];
    if (current?.dispatch?.status !== 'outcome_unknown' || current.providerOrder?.orderId || current.dispatch.operationalQuote?.quotationId !== quoteId) throw blocked('Dispatch changed. Refresh before reconciling.');
    // Reject attaching a booking already assigned to another day of this order.
    if (Object.entries(fresh.fulfilmentOperations || {}).some(([id, op]) => id !== entry.id && op.providerOrder?.orderId === providerOrderId)) throw blocked('That booking is already assigned to another fulfilment.');
    transaction.update(ref, { [`${key}.providerOrder`]: { orderId: providerOrderId, quotationId: quoteId, status: detail.status || '', priceBreakdown: detail.priceBreakdown || {} }, [`${key}.dispatch.reconciledBy`]: args.uid, [`${key}.dispatch.reconciledAt`]: new Date().toISOString(), updatedAt: FieldValue.serverTimestamp() });
  });
  return refreshFulfilmentDelivery(args);
};
