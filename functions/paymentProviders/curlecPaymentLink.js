import { PAYMENT_STATUS, readString } from '../storePaymentsCore.js';
import { CurlecOrderCreationError } from './curlecStandardCheckout.js';

export const CURLEC_PAYMENT_LINK_MODE = 'payment_link';
const API_URL = 'https://api.razorpay.com/v1/payment_links';
const authorizationHeader = (keyId, keySecret) => `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
const paymentLinkReferenceId = order => `mc_${readString(order.id)}`;
const paymentLinkCallbackUrl = ({ returnUrl, checkoutAccessToken }) => {
  const url = new URL(returnUrl);
  // Curlec appends razorpay_payment_link_id and its signature. MiseChef uses
  // that Link ID only to read its order; the signed webhook remains payment truth.
  url.searchParams.set('payment_provider', 'curlec');
  url.searchParams.set('payment_access_token', checkoutAccessToken);
  return url.toString();
};

export const createCurlecPaymentLinkAdapter = (keyId, keySecret, { fetchImpl = fetch } = {}) => {
  if (!readString(keyId) || !readString(keySecret)) throw new Error('Curlec is not configured.');
  return {
    provider: 'curlec', mode: CURLEC_PAYMENT_LINK_MODE, requiresSellingWorkspace: true,
    async createPayment({ order, returnUrl, checkoutAccessToken }) {
      let response;
      try {
        response = await fetchImpl(API_URL, {
          method: 'POST',
          headers: { authorization: authorizationHeader(keyId, keySecret), 'content-type': 'application/json' },
          body: JSON.stringify({
            // Derived exclusively from the server-built order.
            amount: order.payment.amountMinor, currency: order.currency, accept_partial: false,
            reference_id: paymentLinkReferenceId(order), description: `Order ${order.orderNumber}`,
            notify: { sms: false, email: false }, reminder_enable: false,
            callback_url: paymentLinkCallbackUrl({ returnUrl, checkoutAccessToken }), callback_method: 'get',
            notes: { misechefOrderId: order.id, misechefOrderNumber: order.orderNumber },
            // Explicitly disable Card while retaining FPX and Wallets (including TNG).
            options: { checkout: { method: { fpx: true, card: false, wallet: true } } }
          })
        });
      } catch { throw new CurlecOrderCreationError(); }
      const paymentLink = await response.json().catch(() => ({}));
      if (!response.ok || !readString(paymentLink?.id) || !readString(paymentLink?.short_url)) {
        throw new CurlecOrderCreationError({ httpStatus: response.status, errorCode: paymentLink?.error?.code, errorDescription: paymentLink?.error?.description || paymentLink?.error?.message });
      }
      if (Number(paymentLink.amount) !== Number(order.payment.amountMinor) || readString(paymentLink.currency).toUpperCase() !== readString(order.currency)) throw new Error('Curlec payment link amount validation failed.');
      return { providerPaymentId: paymentLink.id, checkout: { type: 'curlec_payment_link', redirectUrl: paymentLink.short_url } };
    },
    async retrievePayment(providerPaymentId, { db } = {}) {
      const snapshot = await db.collection('storeOrders').where('payment.providerPaymentId', '==', readString(providerPaymentId)).limit(1).get();
      const document = snapshot.docs[0];
      if (!document) throw new Error('The matching MiseChef order could not be found.');
      const order = document.data();
      return { providerPaymentId: readString(providerPaymentId), orderId: document.id, amountMinor: Number(order.payment?.amountMinor), currency: readString(order.currency), status: readString(order.payment?.status) || PAYMENT_STATUS.pending, providerStatus: readString(order.payment?.status), paymentMethod: readString(order.payment?.providerPaymentMethod), providerTransactionId: readString(order.payment?.providerTransactionId), failureCode: readString(order.payment?.failureCode) };
    },
    async cancelPayment() { throw new Error('Curlec payment link cancellation is not available from checkout.'); },
    readWebhookUpdate(event) {
      if (readString(event?.event) !== 'payment_link.paid') return { kind: 'ignored' };
      const paymentLink = event?.payload?.payment_link?.entity;
      const payment = event?.payload?.payment?.entity;
      if (!paymentLink || !payment || payment.status !== 'captured' || payment.captured !== true) throw new Error('Curlec paid event does not contain a captured payment.');
      return { kind: 'payment', payment: {
        // Persisted Payment Link ID is the only gateway-to-order lookup key.
        providerPaymentId: readString(paymentLink.id), providerTransactionId: readString(payment.id),
        orderId: readString(paymentLink.notes?.misechefOrderId), amountMinor: Number(payment.amount),
        currency: readString(payment.currency).toUpperCase(), status: PAYMENT_STATUS.paid,
        providerStatus: readString(payment.status), paymentMethod: readString(payment.method), failureCode: ''
      } };
    }
  };
};
