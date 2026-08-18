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
  async createPayment(slug: string, order: StoreOrderDraft, returnUrl: string): Promise<StorePaymentSession> {
    const createPayment = httpsCallable<
      { slug: string; order: StoreOrderDraft; returnUrl: string },
      StorePaymentSession
    >(requireFunctions(), 'createPublicStorePayment');
    const response = await createPayment({ slug, order, returnUrl });
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
  },

  async uploadReceipt(slug: string, session: StorePaymentSession, file: File): Promise<void> {
    if (file.size > 2 * 1024 * 1024) throw new Error('Choose a receipt image smaller than 2 MB.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG, or WebP receipt image.');
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('The receipt image could not be read.'));
      reader.readAsDataURL(file);
    });
    const upload = httpsCallable(requireFunctions(), 'uploadPublicStorePaymentReceipt');
    await upload({
      slug,
      paymentSessionId: session.paymentSessionId,
      checkoutAccessToken: session.checkoutAccessToken,
      dataUrl,
      fileName: file.name
    });
  },

  async submitManual(slug: string, session: StorePaymentSession): Promise<PublicStoreOrderResult> {
    const submit = httpsCallable<
      { slug: string; paymentSessionId: string; checkoutAccessToken: string },
      PublicStoreOrderResult
    >(requireFunctions(), 'submitPublicStoreManualPayment');
    return (await submit({
      slug,
      paymentSessionId: session.paymentSessionId,
      checkoutAccessToken: session.checkoutAccessToken
    })).data;
  }
};
