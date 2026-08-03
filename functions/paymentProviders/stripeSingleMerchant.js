import Stripe from 'stripe';
import {
  PAYMENT_REFUND_STATUS,
  PAYMENT_STATUS,
  readString
} from '../storePaymentsCore.js';

export const STRIPE_PROVIDER_ID = 'stripe';
export const STRIPE_PROVIDER_MODE = 'single_merchant';

const normalizeStripePayment = (paymentIntent, event) => ({
  providerPaymentId: readString(paymentIntent?.id),
  orderId: readString(paymentIntent?.metadata?.misechefOrderId),
  amountMinor: Number(paymentIntent?.amount),
  currency: readString(paymentIntent?.currency).toUpperCase(),
  status: mapStripePaymentStatus(paymentIntent?.status),
  providerStatus: readString(paymentIntent?.status),
  paymentMethod: readStripePaymentMethod(paymentIntent),
  failureCode: readString(paymentIntent?.last_payment_error?.code),
  refund: event ? readStripeRefundState(paymentIntent, event) : undefined
});

export const createStripeSingleMerchantAdapter = secretKey => {
  if (!readString(secretKey)) throw new Error('Stripe is not configured.');
  const stripe = new Stripe(secretKey);

  return {
    provider: STRIPE_PROVIDER_ID,
    mode: STRIPE_PROVIDER_MODE,
    requiresSellingWorkspace: true,

    async createPayment({ order }) {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: order.payment.amountMinor,
        currency: order.currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        description: `${order.storeName} order ${order.orderNumber}`,
        metadata: {
          misechefOrderId: order.id,
          misechefOrderNumber: order.orderNumber,
          misechefWorkspaceId: order.workspaceId,
          paymentProviderMode: STRIPE_PROVIDER_MODE
        }
      }, {
        idempotencyKey: `misechef-order-${order.id}`
      });
      return {
        providerPaymentId: paymentIntent.id,
        checkout: {
          type: 'stripe_payment_element',
          clientSecret: paymentIntent.client_secret
        }
      };
    },

    async retrievePayment(providerPaymentId) {
      const paymentIntent = await stripe.paymentIntents.retrieve(providerPaymentId, {
        expand: ['payment_method', 'latest_charge']
      });
      return normalizeStripePayment(paymentIntent);
    },

    async cancelPayment(providerPaymentId) {
      const paymentIntent = await stripe.paymentIntents.cancel(providerPaymentId, {}, {
        idempotencyKey: `misechef-cancel-${providerPaymentId}`
      });
      return normalizeStripePayment(paymentIntent);
    },

    constructWebhookEvent(rawBody, signature, webhookSecret) {
      return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    },

    async readWebhookUpdate(event) {
      const eventObject = event?.data?.object;
      if (event?.type?.startsWith('payment_intent.')) {
        const paymentIntent = await stripe.paymentIntents.retrieve(readString(eventObject?.id), {
          expand: ['payment_method', 'latest_charge']
        });
        return { kind: 'payment', payment: normalizeStripePayment(paymentIntent) };
      }
      if (event?.type === 'charge.refunded' || event?.type?.startsWith('refund.')) {
        const providerPaymentId = readString(
          typeof eventObject?.payment_intent === 'string'
            ? eventObject.payment_intent
            : eventObject?.payment_intent?.id
        );
        if (!providerPaymentId) throw new Error('Stripe refund event is missing its PaymentIntent.');
        const paymentIntent = await stripe.paymentIntents.retrieve(providerPaymentId, {
          expand: ['payment_method', 'latest_charge']
        });
        return {
          kind: 'refund',
          payment: normalizeStripePayment(paymentIntent, event)
        };
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
