export type RegionCode = 'MY' | 'SG';
export type RegionCurrency = 'MYR' | 'SGD';

export interface RegionProviderOption {
  id: string;
  name: string;
}

export interface RegionConfiguration {
  country: RegionCode;
  countryName: string;
  locale: string;
  timeZone: string;
  currency: RegionCurrency;
  paymentMethods: readonly RegionProviderOption[];
  deliveryProviders: readonly RegionProviderOption[];
  supplierProviders: readonly RegionProviderOption[];
}
