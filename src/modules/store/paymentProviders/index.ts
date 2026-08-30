import { stripeClientPaymentAdapter } from './stripeClientAdapter';
import { manualClientPaymentAdapter } from './manualClientAdapter';
import type { PaymentProviderClientAdapter } from './types';

const paymentProviderClientAdapters: Record<string, PaymentProviderClientAdapter> = {
  [stripeClientPaymentAdapter.provider]: stripeClientPaymentAdapter,
  [manualClientPaymentAdapter.provider]: manualClientPaymentAdapter
};

export const getPaymentProviderClientAdapter = (
  provider: string
): PaymentProviderClientAdapter | null => (
  paymentProviderClientAdapters[provider] || null
);
