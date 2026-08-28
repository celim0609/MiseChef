import type { ComponentType } from 'react';
import type { RegionCurrency } from '../../../regions';
import type { StorePaymentSession } from '../types';

export interface PaymentProviderCheckoutProps {
  session: StorePaymentSession;
  customerName: string;
  phone: string;
  currency: RegionCurrency;
  total: number;
  storeSlug: string;
  storeName: string;
  storeWhatsApp: string;
  returnUrl: string;
  onComplete: (paymentSessionId: string) => Promise<void>;
  onBack: () => Promise<void>;
}

export interface PaymentProviderClientAdapter {
  provider: string;
  Checkout: ComponentType<PaymentProviderCheckoutProps>;
}
