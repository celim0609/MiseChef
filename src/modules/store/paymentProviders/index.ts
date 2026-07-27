import { stripeClientPaymentAdapter } from './stripeClientAdapter';
import type { PaymentProviderClientAdapter } from './types';

const paymentProviderClientAdapters: Record<string, PaymentProviderClientAdapter> = {
  [stripeClientPaymentAdapter.provider]: stripeClientPaymentAdapter
};

export const getPaymentProviderClientAdapter = (
  provider: string
): PaymentProviderClientAdapter | null => (
  paymentProviderClientAdapters[provider] || null
);
