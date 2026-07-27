import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase';
import type {
  PublicStoreOrderResult,
  StoreOrderDraft,
  StorePaymentProviderId,
  StorePaymentSession
} from '../types';

const requireFunctions = () => {
  if (!functions) {
    throw new Error('Secure online payment is temporarily unavailable. Please refresh and try again.');
  }
  return functions;
};

export const storePaymentService = {
  async createPayment(slug: string, order: StoreOrderDraft): Promise<StorePaymentSession> {
    const createPayment = httpsCallable<
      { slug: string; order: StoreOrderDraft },
      StorePaymentSession
    >(requireFunctions(), 'createPublicStorePayment');
    const response = await createPayment({ slug, order });
    return response.data;
  },

  async getResult(
    slug: string,
    provider: StorePaymentProviderId,
    paymentSessionId: string,
    checkoutAccessToken: string
  ): Promise<PublicStoreOrderResult> {
    const getResult = httpsCallable<
      {
        slug: string;
        provider: StorePaymentProviderId;
        paymentSessionId: string;
        checkoutAccessToken: string;
      },
      PublicStoreOrderResult
    >(requireFunctions(), 'getPublicStorePaymentResult');
    const response = await getResult({
      slug,
      provider,
      paymentSessionId,
      checkoutAccessToken
    });
    return response.data;
  },

  async cancel(
    slug: string,
    provider: StorePaymentProviderId,
    paymentSessionId: string,
    checkoutAccessToken: string
  ): Promise<PublicStoreOrderResult> {
    const cancelPayment = httpsCallable<
      {
        slug: string;
        provider: StorePaymentProviderId;
        paymentSessionId: string;
        checkoutAccessToken: string;
      },
      PublicStoreOrderResult
    >(requireFunctions(), 'cancelPublicStorePayment');
    const response = await cancelPayment({
      slug,
      provider,
      paymentSessionId,
      checkoutAccessToken
    });
    return response.data;
  }
};
