import { createHash, randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';

const hash = value => createHash('sha256').update(value).digest('hex');
const proofs = new WeakMap();
export const curlecAttemptReference = id => `mcp_${id.slice(0, 32)}`;
const outcome = (state, reason) => ({ outcome: state, reason, successorAllowed: false });
const attemptMode = attempt => attempt.curlecEnvironment === undefined && /^plink_[A-Za-z0-9]+$/.test(attempt.providerPaymentId || '')
  ? 'live' : attempt.curlecEnvironment;

// This is an observation classifier, never a permission to replace an attempt.
export function classifyCurlecAttemptObservation({ link, payment, attempt, orderId, providerPaymentId }) {
  if (!link) return outcome('not_found_ambiguous', 'absence_is_not_non_creation_proof');
  if (!attempt || !/^[a-f0-9]{64}$/.test(attempt.id || '')
    || !Number.isSafeInteger(attempt.amountMinor) || attempt.amountMinor <= 0
    || !Number.isSafeInteger(attempt.expiresAt) || attempt.expiresAt <= 0
    || !Number.isSafeInteger(attempt.revision) || attempt.revision < 1
    || !/^plink_[A-Za-z0-9]+$/.test(link.id || '')
    || providerPaymentId && link.id !== providerPaymentId
    || attempt.providerPaymentId && link.id !== attempt.providerPaymentId
    || link.reference_id !== curlecAttemptReference(attempt.id)
    || link.notes?.misechefOrderId !== orderId || link.notes?.misechefWeeklyPosAttemptId !== attempt.id
    || String(link.notes?.misechefOrderRevision) !== String(attempt.revision)
    || link.accept_partial !== false || Number(link.expire_by) !== attempt.expiresAt
    || Number(link.amount) !== attempt.amountMinor || link.currency !== attempt.currency)
    return outcome('inconsistent', 'saved_attempt_mismatch');
  const rows = Array.isArray(link.payments) ? link.payments : [];
  if (link.status === 'paid') {
    const captures = rows.filter(p => p.status === 'captured');
    if (Number(link.amount_paid) !== attempt.amountMinor || captures.length !== 1
      || Number(captures[0].amount) !== attempt.amountMinor
      || !/^pay_[A-Za-z0-9]+$/.test(captures[0].payment_id || '')
      || !payment || payment.id !== captures[0].payment_id || payment.status !== 'captured' || payment.captured !== true
      || Number(payment.amount) !== attempt.amountMinor || payment.currency !== attempt.currency
      || Number(payment.amount_refunded || 0) !== 0
      || link.order_id && payment.order_id !== link.order_id)
      return outcome('review_required', 'capture_not_fully_verified');
    return { ...outcome('captured_verified', 'provider_capture_verified'), payment: {
      orderId, providerPaymentId: link.id, providerTransactionId: payment.id, amountMinor: attempt.amountMinor,
      currency: attempt.currency, status: 'paid', providerStatus: 'captured', paymentMethod: payment.method || '',
      weeklyPosAttemptId: attempt.id, weeklyPosReference: curlecAttemptReference(attempt.id),
      weeklyPosRevision: attempt.revision, weeklyPosExpiresAt: attempt.expiresAt,
    } };
  }
  if (Number(link.amount_paid) !== 0 || rows.length) return outcome('review_required', 'payment_activity_requires_review');
  if (link.status === 'created') return outcome('open_unpaid', 'existing_link_must_be_preserved');
  if (['expired', 'cancelled'].includes(link.status))
    return outcome('terminal_unpaid_unconfirmed', 'inflight_payments_not_excluded');
  return outcome('ambiguous', 'unknown_provider_state');
}

export function isHistoricalCurlecWeeklyPayment(order, payment) {
  return order?.weeklyDayPos === true && /^[a-f0-9]{64}$/.test(payment?.weeklyPosAttemptId || '')
    && /^plink_[A-Za-z0-9]+$/.test(payment?.providerPaymentId || '')
    && (order.weeklyPosLink?.attemptId !== payment.weeklyPosAttemptId
      || order.payment?.providerPaymentId !== payment.providerPaymentId
      || order.manualOrder?.revision !== payment.weeklyPosRevision);
}
export const hasHistoricalCurlecProof = payment => proofs.has(payment);

const snapshotDigest = attempt => hash(JSON.stringify([
  attempt.id, attempt.orderId, attempt.storeId, attempt.provider, attempt.mode, attempt.revision,
  attempt.amountMinor, attempt.currency, attempt.expiresAt, attempt.merchantFingerprint,
  attempt.curlecEnvironment ?? null, attempt.providerPaymentId ?? null,
]));

export async function resolveHistoricalCurlecAttempt({ db, transaction, order, payment, mode, merchantFingerprint }) {
  const id = payment.weeklyPosAttemptId;
  if (!/^[a-f0-9]{64}$/.test(id || '')) throw new Error('Invalid historical Curlec attempt.');
  const ref = db.collection('storeCheckoutAttempts').doc(id);
  const doc = await (transaction ? transaction.get(ref) : ref.get());
  if (!doc.exists) throw new Error('The historical Curlec attempt is unavailable.');
  const attempt = { ...doc.data(), id };
  if (attempt.orderId !== payment.orderId || attempt.storeId !== order.storeId
    || attempt.provider !== 'curlec' || attempt.mode !== 'payment_link'
    || !['live', 'test'].includes(mode) || attemptMode(attempt) !== mode
    || order.payment?.curlecEnvironment && order.payment.curlecEnvironment !== mode
    || !/^[a-f0-9]{64}$/.test(merchantFingerprint || '') || attempt.merchantFingerprint !== merchantFingerprint
    || !Number.isSafeInteger(attempt.amountMinor) || attempt.amountMinor <= 0
    || !Number.isSafeInteger(attempt.revision) || attempt.revision < 1
    || !Number.isSafeInteger(attempt.expiresAt) || attempt.expiresAt <= 0
    || payment.weeklyPosReference !== curlecAttemptReference(id)
    || payment.weeklyPosRevision !== attempt.revision || payment.weeklyPosExpiresAt !== attempt.expiresAt
    || payment.amountMinor !== attempt.amountMinor || payment.currency !== attempt.currency
    || attempt.providerPaymentId && attempt.providerPaymentId !== payment.providerPaymentId)
    throw new Error('Historical Curlec payment does not match its saved attempt.');
  return attempt;
}

export async function verifyHistoricalCurlecPayment({ db, adapter, order, payment }) {
  const mode = adapter.curlecEnvironment || adapter.curlecVerificationEnvironment;
  const merchantFingerprint = adapter.curlecMerchantFingerprint;
  const attempt = await resolveHistoricalCurlecAttempt({ db, order, payment, mode, merchantFingerprint });
  if (typeof adapter.inspectWeeklyPosAttempt !== 'function') throw new Error('Historical provider verification is unavailable.');
  const result = await adapter.inspectWeeklyPosAttempt({ orderId: payment.orderId, attempt, providerPaymentId: payment.providerPaymentId });
  if (result.outcome !== 'captured_verified' || result.payment?.providerTransactionId !== payment.providerTransactionId)
    throw new Error('The historical Curlec capture requires provider verification.');
  const verified = Object.freeze({ ...result.payment, curlecEnvironment: mode });
  proofs.set(verified, { mode, merchantFingerprint, digest: snapshotDigest(attempt), correlationId: randomUUID() });
  return verified;
}

// Historical captures are acknowledged and audited, never applied to a newer
// order revision or current payment. Phase 2 settlement/replacement stays off.
export async function auditHistoricalCurlecCapture({ db, transaction, order, payment }) {
  const proof = proofs.get(payment);
  if (!proof) throw new Error('Historical Curlec capture has no server verification proof.');
  const attempt = await resolveHistoricalCurlecAttempt({ db, transaction, order, payment, ...proof });
  if (snapshotDigest(attempt) !== proof.digest) throw new Error('Historical Curlec attempt changed during verification.');
  const matches = await transaction.get(db.collection('storeOrders')
    .where('payment.providerTransactionId', '==', payment.providerTransactionId).limit(2));
  if (matches.docs.some(doc => doc.id !== payment.orderId)) throw new Error('Payment transaction is already bound to a different MiseChef order.');
  const ref = db.collection('storePaymentAttemptVerifications').doc(hash(`curlec:${payment.providerTransactionId}`));
  const prior = await transaction.get(ref);
  if (prior.exists) {
    const record = prior.data();
    if (record.orderId !== payment.orderId || record.attemptId !== attempt.id || record.mode !== proof.mode
      || record.merchantFingerprint !== proof.merchantFingerprint
      || record.providerPaymentHash !== hash(payment.providerPaymentId)
      || record.providerTransactionHash !== hash(payment.providerTransactionId)
      || record.attemptSnapshotHash !== proof.digest || record.schemaVersion !== 1
      || record.outcome !== 'captured_verified' || record.financialEffect !== 'none'
      || record.type !== 'historical_capture_review_required' || record.requiresReview !== true)
      throw new Error('Historical payment verification conflicts with an existing record.');
    return order;
  }
  transaction.create(ref, {
    type: 'historical_capture_review_required', orderId: payment.orderId, attemptId: attempt.id,
    mode: proof.mode, merchantFingerprint: proof.merchantFingerprint,
    schemaVersion: 1, attemptSnapshotHash: proof.digest, correlationId: proof.correlationId,
    providerPaymentHash: hash(payment.providerPaymentId), providerTransactionHash: hash(payment.providerTransactionId),
    outcome: 'captured_verified', requiresReview: true, financialEffect: 'none',
    createdAt: FieldValue.serverTimestamp(),
  });
  return order;
}
