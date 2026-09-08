import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { PAYMENT_STATUS, readString } from '../storePaymentsCore.js';

export const CURLEC_PROVIDER_ID = 'curlec';
export const CURLEC_PROVIDER_MODE = 'standard_checkout';
const API_URL = 'https://api.razorpay.com/v1/orders';

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
  return {
    provider: CURLEC_PROVIDER_ID,
    mode: CURLEC_PROVIDER_MODE,
    requiresSellingWorkspace: true,
    async createPayment({ order }) {
      const response = await fetchImpl(API_URL, {
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
      const gatewayOrder = await response.json().catch(() => ({}));
      if (!response.ok || !readString(gatewayOrder?.id)) throw new Error('Curlec could not create a payment order.');
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
