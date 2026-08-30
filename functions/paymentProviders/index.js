import { readString } from '../storePaymentsCore.js';
import {
  createStripeSingleMerchantAdapter,
  STRIPE_PROVIDER_ID
} from './stripeSingleMerchant.js';
import { createManualPaymentAdapter, MANUAL_PAYMENT_PROVIDER_ID } from './manualPayment.js';

export const PRIMARY_PAYMENT_PROVIDER = STRIPE_PROVIDER_ID;

export const createPrimaryPaymentAdapter = ({ stripeSecretKey }) => (
  createStripeSingleMerchantAdapter(stripeSecretKey)
);

export const createPaymentAdapter = (provider, { stripeSecretKey, method } = {}) => {
  if (readString(provider) === STRIPE_PROVIDER_ID) {
    return createStripeSingleMerchantAdapter(stripeSecretKey);
  }
  if (readString(provider) === MANUAL_PAYMENT_PROVIDER_ID) {
    return createManualPaymentAdapter(method || {});
  }
  throw new Error('This payment provider is not available.');
};
