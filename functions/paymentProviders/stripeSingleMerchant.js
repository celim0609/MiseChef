import Stripe from 'stripe';
import {
  PAYMENT_REFUND_STATUS,
  PAYMENT_STATUS,
  readString
} from '../storePaymentsCore.js';

export const STRIPE_PROVIDER_ID = 'stripe';
export const STRIPE_PROVIDER_MODE = 'single_merchant';

const readPaymentIntent = session => {
  const paymentIntent = session?.payment_intent;
  return paymentIntent && typeof paymentIntent === 'object' ? paymentIntent : null;
};

const checkoutStatus = (session, paymentIntent) => {
  if (session?.payment_status === 'paid' || session?.payment_status === 'no_payment_required') {
    return PAYMENT_STATUS.paid;
  }
  if (session?.status === 'expired') return PAYMENT_STATUS.cancelled;
  if (paymentIntent) return mapStripePaymentStatus(paymentIntent.status);
  return PAYMENT_STATUS.pending;
};

const normalizeCheckoutPayment = session => {
  const paymentIntent = readPaymentIntent(session);
  return {
    providerPaymentId: readString(session?.id),
    providerTransactionId: readString(paymentIntent?.id || session?.payment_intent),
    orderId: readString(session?.metadata?.misechefOrderId || paymentIntent?.metadata?.misechefOrderId),
    amountMinor: Number(session?.amount_total),
    currency: readString(session?.currency).toUpperCase(),
    status: checkoutStatus(session, paymentIntent),
    providerStatus: readString(session?.payment_status || session?.status),
    paymentMethod: readStripePaymentMethod(paymentIntent),
    failureCode: readString(paymentIntent?.last_payment_error?.code)
  };
};

const normalizeLegacyPaymentIntent = (paymentIntent, event) => ({
  providerPaymentId: readString(paymentIntent?.id),
  providerTransactionId: readString(paymentIntent?.id),
  orderId: readString(paymentIntent?.metadata?.misechefOrderId),
  amountMinor: Number(paymentIntent?.amount),
  currency: readString(paymentIntent?.currency).toUpperCase(),
  status: mapStripePaymentStatus(paymentIntent?.status),
  providerStatus: readString(paymentIntent?.status),
  paymentMethod: readStripePaymentMethod(paymentIntent),
  failureCode: readString(paymentIntent?.last_payment_error?.code),
  refund: event ? readStripeRefundState(paymentIntent, event) : undefined
});

export const buildStripeCheckoutUrls = ({ returnUrl, providerPaymentId, checkoutAccessToken }) => {
  const successUrl = new URL(returnUrl);
  successUrl.searchParams.set('payment_return', '1');
  successUrl.searchParams.set('payment_provider', STRIPE_PROVIDER_ID);
  successUrl.searchParams.set('payment_session_id', providerPaymentId);
  successUrl.searchParams.set('payment_access_token', checkoutAccessToken);

  const cancelUrl = new URL(successUrl);
  cancelUrl.searchParams.set('payment_cancelled', '1');
  return {
    successUrl: successUrl.toString().replace('%7BCHECKOUT_SESSION_ID%7D', '{CHECKOUT_SESSION_ID}'),
    cancelUrl: cancelUrl.toString().replace('%7BCHECKOUT_SESSION_ID%7D', '{CHECKOUT_SESSION_ID}')
  };
};

const retrieveCheckoutSession = (stripe, sessionId) => stripe.checkout.sessions.retrieve(sessionId, {
  expand: ['payment_intent.payment_method', 'payment_intent.latest_charge']
});

const findCheckoutSessionForPaymentIntent = async (stripe, paymentIntentId) => {
  const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 });
  const session = sessions?.data?.[0];
  return session ? retrieveCheckoutSession(stripe, session.id) : null;
};

export const createStripeSingleMerchantAdapter = (secretKey, { stripeClient } = {}) => {
  if (!stripeClient && !readString(secretKey)) throw new Error('Stripe is not configured.');
  const stripe = stripeClient || new Stripe(secretKey);

  return {
    provider: STRIPE_PROVIDER_ID,
    mode: STRIPE_PROVIDER_MODE,
    requiresSellingWorkspace: true,

    async createPayment({ order, returnUrl, checkoutAccessToken }) {
      const placeholder = '{CHECKOUT_SESSION_ID}';
      const urls = buildStripeCheckoutUrls({
        returnUrl,
        providerPaymentId: placeholder,
        checkoutAccessToken
      });
      const metadata = {
        misechefOrderId: order.id,
        misechefOrderNumber: order.orderNumber,
        misechefWorkspaceId: order.workspaceId,
        paymentProviderMode: STRIPE_PROVIDER_MODE
      };
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        client_reference_id: order.id,
        success_url: urls.successUrl,
        cancel_url: urls.cancelUrl,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: order.currency.toLowerCase(),
            unit_amount: order.payment.amountMinor,
            product_data: {
              name: `${order.storeName} order ${order.orderNumber}`,
              description: 'MiseChef Grab & Go pre-order'
            }
          }
        }],
        metadata,
        payment_intent_data: { metadata }
        // payment_method_types is intentionally omitted. Stripe dynamically presents
        // Dashboard-enabled methods that are eligible for the currency and customer.
      }, {
        idempotencyKey: `misechef-order-${order.id}`
      });
      return {
        providerPaymentId: session.id,
        checkout: {
          type: 'provider_redirect',
          redirectUrl: session.url
        }
      };
    },

    async retrievePayment(providerPaymentId) {
      if (providerPaymentId.startsWith('pi_')) {
        const paymentIntent = await stripe.paymentIntents.retrieve(providerPaymentId, {
          expand: ['payment_method', 'latest_charge']
        });
        return normalizeLegacyPaymentIntent(paymentIntent);
      }
      return normalizeCheckoutPayment(await retrieveCheckoutSession(stripe, providerPaymentId));
    },

    async cancelPayment(providerPaymentId) {
      if (providerPaymentId.startsWith('pi_')) {
        const paymentIntent = await stripe.paymentIntents.cancel(providerPaymentId, {}, {
          idempotencyKey: `misechef-cancel-${providerPaymentId}`
        });
        return normalizeLegacyPaymentIntent(paymentIntent);
      }
      return normalizeCheckoutPayment(await stripe.checkout.sessions.expire(providerPaymentId));
    },

    constructWebhookEvent(rawBody, signature, webhookSecret) {
      return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    },

    async readWebhookUpdate(event) {
      const eventObject = event?.data?.object;
      if (event?.type?.startsWith('checkout.session.')) {
        const session = await retrieveCheckoutSession(stripe, readString(eventObject?.id));
        return { kind: 'payment', payment: normalizeCheckoutPayment(session) };
      }
      if (event?.type?.startsWith('payment_intent.')) {
        const paymentIntentId = readString(eventObject?.id);
        const session = await findCheckoutSessionForPaymentIntent(stripe, paymentIntentId);
        if (session) return { kind: 'payment', payment: normalizeCheckoutPayment(session) };
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
          expand: ['payment_method', 'latest_charge']
        });
        return { kind: 'payment', payment: normalizeLegacyPaymentIntent(paymentIntent) };
      }
      if (event?.type === 'charge.refunded' || event?.type?.startsWith('refund.')) {
        const paymentIntentId = readString(
          typeof eventObject?.payment_intent === 'string'
            ? eventObject.payment_intent
            : eventObject?.payment_intent?.id
        );
        if (!paymentIntentId) throw new Error('Stripe refund event is missing its PaymentIntent.');
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
          expand: ['payment_method', 'latest_charge']
        });
        const session = await findCheckoutSessionForPaymentIntent(stripe, paymentIntentId);
        const payment = session
          ? { ...normalizeCheckoutPayment(session), refund: readStripeRefundState(paymentIntent, event) }
          : normalizeLegacyPaymentIntent(paymentIntent, event);
        return { kind: 'refund', payment };
      }
      return { kind: 'ignored' };
    }
  };
};

export const mapStripePaymentStatus = stripeStatus => ({
  succeeded: PAYMENT_STATUS.paid,
  processing: PAYMENT_STATUS.processing,
  requires_payment_method: PAYMENT_STATUS.failed,
  canceled: PAYMENT_STATUS.cancelled
})[stripeStatus] || PAYMENT_STATUS.pending;

export const readStripePaymentMethod = paymentIntent => {
  const method = paymentIntent?.payment_method;
  if (method && typeof method === 'object') return readString(method.type);
  return '';
};

export const readStripeRefundState = (paymentIntent, event) => {
  const charge = paymentIntent?.latest_charge && typeof paymentIntent.latest_charge === 'object'
    ? paymentIntent.latest_charge
    : null;
  const refundedAmountMinor = Number.isFinite(Number(charge?.amount_refunded))
    ? Number(charge.amount_refunded)
    : 0;
  const refundEvent = event?.type?.startsWith('refund.')
    && event.data?.object
    && typeof event.data.object === 'object'
    ? event.data.object
    : null;
  const refundFailureCode = readString(
    refundEvent?.failure_reason || refundEvent?.failure_balance_transaction
  );
  if (event?.type === 'refund.failed' || refundEvent?.status === 'failed') {
    return {
      status: PAYMENT_REFUND_STATUS.failed,
      refundedAmountMinor,
      failureCode: refundFailureCode || 'refund_failed'
    };
  }
  if (refundedAmountMinor >= Number(paymentIntent?.amount) && refundedAmountMinor > 0) {
    return {
      status: PAYMENT_REFUND_STATUS.refunded,
      refundedAmountMinor,
      failureCode: ''
    };
  }
  if (refundedAmountMinor > 0) {
    return {
      status: PAYMENT_REFUND_STATUS.partial,
      refundedAmountMinor,
      failureCode: ''
    };
  }
  if (refundEvent?.status === 'pending' || event?.type === 'refund.created') {
    return {
      status: PAYMENT_REFUND_STATUS.pending,
      refundedAmountMinor,
      failureCode: ''
    };
  }
  return {
    status: PAYMENT_REFUND_STATUS.none,
    refundedAmountMinor,
    failureCode: ''
  };
};
