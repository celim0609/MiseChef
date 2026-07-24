import type { RegionCode, RegionConfiguration } from './types';

export const DEFAULT_REGION_CODE: RegionCode = 'MY';
export const LEGACY_WORKSPACE_REGION_CODE: RegionCode = 'SG';

export const REGION_CONFIGURATIONS = {
  MY: {
    country: 'MY',
    countryName: 'Malaysia',
    locale: 'en-MY',
    currency: 'MYR',
    paymentMethods: [
      { id: 'touch-n-go', name: "Touch 'n Go" },
      { id: 'grabpay-my', name: 'GrabPay MY' },
      { id: 'fpx', name: 'FPX' },
      { id: 'card', name: 'Card' }
    ],
    // Provider catalogs stay empty until product-approved integrations are configured.
    deliveryProviders: [],
    supplierProviders: []
  },
  SG: {
    country: 'SG',
    countryName: 'Singapore',
    locale: 'en-SG',
    currency: 'SGD',
    paymentMethods: [
      { id: 'paynow', name: 'PayNow' },
      { id: 'grabpay-sg', name: 'GrabPay SG' },
      { id: 'card', name: 'Card' }
    ],
    // Provider catalogs stay empty until product-approved integrations are configured.
    deliveryProviders: [],
    supplierProviders: []
  }
} as const satisfies Record<RegionCode, RegionConfiguration>;

export const DEFAULT_REGION_CONFIGURATION = REGION_CONFIGURATIONS[DEFAULT_REGION_CODE];
