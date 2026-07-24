import { DEFAULT_REGION_CODE, LEGACY_WORKSPACE_REGION_CODE, REGION_CONFIGURATIONS } from './config';
import type { RegionCode, RegionConfiguration } from './types';

const SUPPORTED_REGION_CODES = Object.keys(REGION_CONFIGURATIONS) as RegionCode[];

export interface RegionWorkspace {
  country?: unknown;
}

export const isSupportedRegionCode = (value: unknown): value is RegionCode => (
  typeof value === 'string'
  && SUPPORTED_REGION_CODES.includes(value.trim().toUpperCase() as RegionCode)
);

export const normalizeRegionCode = (
  value: unknown,
  fallback: RegionCode = DEFAULT_REGION_CODE
): RegionCode => {
  if (!isSupportedRegionCode(value)) return fallback;
  return value.trim().toUpperCase() as RegionCode;
};

export const getRegionConfiguration = (country: unknown): RegionConfiguration => (
  REGION_CONFIGURATIONS[normalizeRegionCode(country)]
);

export const getWorkspaceRegionConfiguration = (
  workspace?: RegionWorkspace | null
): RegionConfiguration => {
  const country = workspace
    ? normalizeRegionCode(workspace.country, LEGACY_WORKSPACE_REGION_CODE)
    : DEFAULT_REGION_CODE;
  return REGION_CONFIGURATIONS[country];
};

export const formatRegionCurrency = (
  value: number,
  currency: string
) => `${currency} ${Number(value || 0).toFixed(2)}`;

export const regionService = {
  defaultCountry: DEFAULT_REGION_CODE,
  supportedCountries: SUPPORTED_REGION_CODES,
  isSupportedCountry: isSupportedRegionCode,
  normalizeCountry: normalizeRegionCode,
  getConfiguration: getRegionConfiguration,
  forWorkspace: getWorkspaceRegionConfiguration,
  formatCurrency: formatRegionCurrency
};
