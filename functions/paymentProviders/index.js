import { readString } from '../storePaymentsCore.js';
import {
  createStripeSingleMerchantAdapter,
  STRIPE_PROVIDER_ID
} from './stripeSingleMerchant.js';
import { createManualPaymentAdapter, MANUAL_PAYMENT_PROVIDER_ID } from './manualPayment.js';
import { createCurlecStandardCheckoutAdapter, CURLEC_PROVIDER_ID } from './curlecStandardCheckout.js';
import { createCurlecPaymentLinkAdapter } from './curlecPaymentLink.js';

export const PRIMARY_PAYMENT_PROVIDER = STRIPE_PROVIDER_ID;

export const createPrimaryPaymentAdapter = ({ stripeSecretKey }) => (
  createStripeSingleMerchantAdapter(stripeSecretKey)
);

export const createPaymentAdapter = (provider, { stripeSecretKey, curlecKeyId, curlecKeySecret, method, fetchImpl, curlecPaymentLink = false } = {}) => {
  if (readString(provider) === STRIPE_PROVIDER_ID) {
    return createStripeSingleMerchantAdapter(stripeSecretKey);
  }
  if (readString(provider) === MANUAL_PAYMENT_PROVIDER_ID) {
    return createManualPaymentAdapter(method || {});
  }
  if (readString(provider) === CURLEC_PROVIDER_ID) {
    if (curlecPaymentLink === true) return createCurlecPaymentLinkAdapter(curlecKeyId, curlecKeySecret, { fetchImpl });
    return createCurlecStandardCheckoutAdapter(curlecKeyId, curlecKeySecret, { fetchImpl });
  }
  throw new Error('This payment provider is not available.');
};
