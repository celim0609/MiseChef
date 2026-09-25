import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { PAYMENT_STATUS, readString } from '../storePaymentsCore.js';

export const CURLEC_PROVIDER_ID = 'curlec';
export const CURLEC_PROVIDER_MODE = 'standard_checkout';
const API_URL = 'https://api.razorpay.com/v1/orders';
const MAX_DIAGNOSTIC_TEXT_LENGTH = 512;

const diagnosticText = value => readString(value).slice(0, MAX_DIAGNOSTIC_TEXT_LENGTH);

export class CurlecOrderCreationError extends Error {
  constructor({ httpStatus = null, errorCode = '', errorDescription = '' } = {}) {
    super('Curlec could not create a payment order.');
    this.name = 'CurlecOrderCreationError';
    this.curlecHttpStatus = Number.isInteger(httpStatus) ? httpStatus : null;
    this.curlecErrorCode = diagnosticText(errorCode);
    this.curlecErrorDescription = diagnosticText(errorDescription);
  }
}

// This deliberately exposes no gateway response details: a manual result
// lookup must be retryable, but its diagnostics must not disclose payment data.
export class CurlecPaymentLookupError extends Error {
  constructor() {
    super('Curlec payment status could not be verified.');
    this.name = 'CurlecPaymentLookupError';
  }
}

const normalizePayment = payment => ({
  providerPaymentId: readString(payment?.order_id),
  providerTransactionId: readString(payment?.id),
  orderId: readString(payment?.notes?.misechefOrderId),
  amountMinor: Number(payment?.amount),
  currency: readString(payment?.currency).toUpperCase(),
  status: payment?.status === 'captured' && payment?.captured === true ? PAYMENT_STATUS.paid
    : payment?.status === 'failed' ? PAYMENT_STATUS.failed : PAYMENT_STATUS.pending,
  providerStatus: readString(payment?.status),
  paymentMethod: readString(payment?.method),
  failureCode: readString(payment?.error_code || payment?.error_reason)
});

const sameCurrency = (left, right) => readString(left).toUpperCase() === readString(right).toUpperCase();

const hasMatchingMiseChefOrderRelationship = (providerOrder, order) => (
  readString(providerOrder?.receipt) === readString(order?.orderNumber)
  && readString(providerOrder?.notes?.misechefOrderId) === readString(order?.id)
  && readString(providerOrder?.notes?.misechefOrderNumber) === readString(order?.orderNumber)
);

const isExactProviderOrder = (providerOrder, order, providerPaymentId) => (
  readString(providerOrder?.id) === readString(providerPaymentId)
  && readString(providerOrder?.status) === 'paid'
  && Number(providerOrder?.amount) === Number(order?.payment?.amountMinor)
  && sameCurrency(providerOrder?.currency, order?.currency)
  && Number(providerOrder?.amount_paid) === Number(order?.payment?.amountMinor)
  && Number(providerOrder?.amount_due) === 0
  && hasMatchingMiseChefOrderRelationship(providerOrder, order)
);

const isExactProviderPayment = (payment, order, providerPaymentId) => (
  readString(payment?.order_id) === readString(providerPaymentId)
  && Number(payment?.amount) === Number(order?.payment?.amountMinor)
  && sameCurrency(payment?.currency, order?.currency)
);

export const verifyCurlecWebhookSignature = (rawBody, signature, webhookSecret) => {
  const expected = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  const received = Buffer.from(readString(signature), 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return received.length === expectedBuffer.length && received.length > 0
    && timingSafeEqual(received, expectedBuffer);
};

export const getCurlecWebhookDedupeId = event => {
  const supplied = readString(event?.id);
  if (supplied) return `curlec_${supplied}`;
  const payment = event?.payload?.payment?.entity || {};
  const order = event?.payload?.order?.entity || {};
  const material = [readString(event?.event), readString(payment.id), readString(payment.order_id), readString(order.id), String(event?.created_at || '')].join('|');
  if (!material.replaceAll('|', '')) throw new Error('Curlec webhook has no stable event identity.');
  return `curlec_${createHash('sha256').update(material).digest('hex')}`;
};

export const createCurlecStandardCheckoutAdapter = (keyId, keySecret, { fetchImpl = fetch } = {}) => {
  if (!readString(keyId) || !readString(keySecret)) throw new Error('Curlec is not configured.');
  const lookupAuthorization = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
  const fetchJson = async url => {
    let response;
    try {
      response = await fetchImpl(url, { headers: { authorization: lookupAuthorization } });
    } catch {
      throw new CurlecPaymentLookupError();
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new CurlecPaymentLookupError();
    return body;
  };
  return {
    provider: CURLEC_PROVIDER_ID,
    mode: CURLEC_PROVIDER_MODE,
    requiresSellingWorkspace: true,
    async createPayment({ order }) {
      let response;
      try {
        response = await fetchImpl(API_URL, {
          method: 'POST',
          headers: {
            authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            amount: order.payment.amountMinor,
            currency: order.currency,
            receipt: order.orderNumber,
            notes: { misechefOrderId: order.id, misechefOrderNumber: order.orderNumber }
          })
        });
      } catch {
        throw new CurlecOrderCreationError();
      }
      const gatewayOrder = await response.json().catch(() => ({}));
      if (!response.ok || !readString(gatewayOrder?.id)) {
        throw new CurlecOrderCreationError({
          httpStatus: response.status,
          errorCode: gatewayOrder?.error?.code,
          errorDescription: gatewayOrder?.error?.description || gatewayOrder?.error?.message
        });
      }
      if (Number(gatewayOrder.amount) !== Number(order.payment.amountMinor)
        || readString(gatewayOrder.currency).toUpperCase() !== readString(order.currency)) {
        throw new Error('Curlec order amount validation failed.');
      }
      return {
        providerPaymentId: gatewayOrder.id,
        checkout: {
          type: 'curlec_standard_checkout',
          keyId,
          orderId: gatewayOrder.id,
          amountMinor: order.payment.amountMinor,
          currency: order.currency,
          name: order.storeName,
          description: `Order ${order.orderNumber}`
        }
      };
    },
    async retrievePayment(providerPaymentId, { db } = {}) {
      const snapshot = await db.collection('storeOrders')
        .where('payment.providerPaymentId', '==', readString(providerPaymentId)).limit(1).get();
      const document = snapshot.docs[0];
      if (!document) throw new Error('The matching MiseChef order could not be found.');
      const order = document.data();
      return {
        providerPaymentId: readString(providerPaymentId), orderId: document.id,
        amountMinor: Number(order.payment?.amountMinor), currency: readString(order.currency),
        status: readString(order.payment?.status) || PAYMENT_STATUS.pending,
        providerStatus: readString(order.payment?.status), paymentMethod: readString(order.payment?.providerPaymentMethod),
        providerTransactionId: readString(order.payment?.providerTransactionId), failureCode: readString(order.payment?.failureCode)
      };
    },
    async retrieveVerifiedCapturedPayment({ order }) {
      const providerPaymentId = readString(order?.payment?.providerPaymentId);
      if (!providerPaymentId) throw new CurlecPaymentLookupError();
      const providerOrderUrl = `${API_URL}/${encodeURIComponent(providerPaymentId)}`;
      const providerOrder = await fetchJson(providerOrderUrl);
      if (!isExactProviderOrder(providerOrder, order, providerPaymentId)) return null;

      const paymentCollection = await fetchJson(`${providerOrderUrl}/payments`);
      const payments = Array.isArray(paymentCollection?.items) ? paymentCollection.items : null;
      if (!payments) return null;
      // A provider order payment collection must not contain payments for a
      // different provider order or mismatched money values. Treat an anomalous
      // response as unverifiable rather than selecting a favorable entry.
      if (payments.some(payment => !isExactProviderPayment(payment, order, providerPaymentId))) return null;
      const capturedPayments = payments.filter(payment => (
        isExactProviderPayment(payment, order, providerPaymentId)
        && payment?.status === 'captured'
        && payment?.captured === true
        && readString(payment?.id)
      ));
      if (capturedPayments.length !== 1) return null;

      const normalized = normalizePayment(capturedPayments[0]);
      return {
        ...normalized,
        // The source is the authorized, persisted MiseChef order—not a
        // relationship claimed by the browser or inferred from payment state.
        orderId: readString(order.id),
        status: PAYMENT_STATUS.paid
      };
    },
    async cancelPayment() { throw new Error('Curlec checkout cancellation is client-side only.'); },
    readWebhookUpdate(event) {
      const type = readString(event?.event);
      const payment = event?.payload?.payment?.entity;
      if (!payment || !['order.paid', 'payment.captured', 'payment.failed'].includes(type)) return { kind: 'ignored' };
      const normalized = normalizePayment(payment);
      normalized.orderId = readString(payment?.notes?.misechefOrderId)
        || readString(event?.payload?.order?.entity?.notes?.misechefOrderId);
      if ((type === 'order.paid' || type === 'payment.captured') && normalized.status !== PAYMENT_STATUS.paid) {
        throw new Error('Curlec paid event does not contain a captured payment.');
      }
      if (type === 'payment.failed') normalized.status = PAYMENT_STATUS.failed;
      return { kind: 'payment', payment: normalized };
    }
  };
};
