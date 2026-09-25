import { isValidPublicAccountReturnTo } from '../public/hostReturnNavigation';
import type { StorePaymentProviderId } from './types';

const STORE_CUSTOMER_SESSION_KEY = 'misechef_store_customer_session';

export type StoreClaimEnvelope = {
  slug: string;
  provider: StorePaymentProviderId;
  paymentSessionId: string;
  checkoutAccessToken: string;
  orderId?: string;
};

type StoreCustomerSession = {
  returnTo: string;
  claimEnvelope?: StoreClaimEnvelope;
};

const readSession = (): StoreCustomerSession | null => {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(STORE_CUSTOMER_SESSION_KEY) || '') as Partial<StoreCustomerSession>;
    if (typeof parsed.returnTo !== 'string' || !isValidPublicAccountReturnTo(parsed.returnTo)) return null;
    if (parsed.claimEnvelope && (!parsed.claimEnvelope.slug || !parsed.claimEnvelope.provider
      || !parsed.claimEnvelope.paymentSessionId || !parsed.claimEnvelope.checkoutAccessToken)) return null;
    return parsed as StoreCustomerSession;
  } catch {
    return null;
  }
};

const writeSession = (session: StoreCustomerSession) => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(STORE_CUSTOMER_SESSION_KEY, JSON.stringify(session));
};

export const beginStoreCustomerSession = (returnTo: string) => {
  if (!isValidPublicAccountReturnTo(returnTo)) return false;
  writeSession({ returnTo });
  return true;
};

export const setClaimEnvelope = (claimEnvelope: StoreClaimEnvelope) => {
  const current = readSession();
  if (!current || !claimEnvelope.slug || !claimEnvelope.provider || !claimEnvelope.paymentSessionId || !claimEnvelope.checkoutAccessToken) return false;
  writeSession({ ...current, claimEnvelope });
  return true;
};

export const getClaimEnvelope = () => readSession()?.claimEnvelope || null;

export const clearStoreCustomerSession = () => {
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(STORE_CUSTOMER_SESSION_KEY);
};

export const hasStoreClaim = () => Boolean(getClaimEnvelope());
