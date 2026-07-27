import { readString } from '../storePaymentsCore.js';
import {
  createStripeSingleMerchantAdapter,
  STRIPE_PROVIDER_ID
} from './stripeSingleMerchant.js';

export const PRIMARY_PAYMENT_PROVIDER = STRIPE_PROVIDER_ID;

export const createPrimaryPaymentAdapter = ({ stripeSecretKey }) => (
  createStripeSingleMerchantAdapter(stripeSecretKey)
);

export const createPaymentAdapter = (provider, { stripeSecretKey }) => {
  if (readString(provider) === STRIPE_PROVIDER_ID) {
    return createStripeSingleMerchantAdapter(stripeSecretKey);
  }
  throw new Error('This payment provider is not available.');
};
