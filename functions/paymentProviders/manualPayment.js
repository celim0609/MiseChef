import { PAYMENT_STATUS, readString } from '../storePaymentsCore.js';

export const MANUAL_PAYMENT_PROVIDER_ID = 'manual';
export const MANUAL_PAYMENT_PROVIDER_MODE = 'manual';

const normalizeOrderPayment = order => ({
  providerPaymentId: readString(order?.id),
  orderId: readString(order?.id),
  amountMinor: Number(order?.payment?.amountMinor),
  currency: readString(order?.currency),
  status: readString(order?.payment?.status) || PAYMENT_STATUS.pending,
  providerStatus: readString(order?.payment?.status),
  paymentMethod: readString(order?.paymentMethodId),
  failureCode: readString(order?.payment?.failureCode)
});

export const createManualPaymentAdapter = method => ({
  provider: MANUAL_PAYMENT_PROVIDER_ID,
  mode: MANUAL_PAYMENT_PROVIDER_MODE,
  requiresSellingWorkspace: false,

  async createPayment({ order }) {
    return {
      providerPaymentId: order.id,
      checkout: {
        type: 'manual_payment',
        methodId: method.id,
        methodName: method.name,
        qrCodeUrl: method.qrCodeUrl,
        instructions: method.instructions,
        receiptAllowed: method.receiptAllowed
      }
    };
  },

  async retrievePayment(providerPaymentId, { db } = {}) {
    const snapshot = await db.collection('storeOrders').doc(readString(providerPaymentId)).get();
    if (!snapshot.exists) throw new Error('The matching MiseChef order could not be found.');
    return normalizeOrderPayment({ id: snapshot.id, ...snapshot.data() });
  },

  async cancelPayment(providerPaymentId, { db } = {}) {
    const reference = db.collection('storeOrders').doc(readString(providerPaymentId));
    const snapshot = await reference.get();
    if (!snapshot.exists) throw new Error('The matching MiseChef order could not be found.');
    const order = { id: snapshot.id, ...snapshot.data() };
    if (order.payment?.status === PAYMENT_STATUS.pending) {
      await reference.update({
        status: 'Payment Cancelled',
        'payment.status': PAYMENT_STATUS.cancelled,
        'payment.updatedAt': new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      order.payment = { ...order.payment, status: PAYMENT_STATUS.cancelled };
    }
    return normalizeOrderPayment(order);
  }
});
