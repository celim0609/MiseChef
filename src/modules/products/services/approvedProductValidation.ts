export const APPROVED_MERCHANT_HOSTNAME = 's.shopee.sg' as const;

export const normalizeApprovedAffiliateUrl = (value: string) => {
  const trimmed = value.trim();
  try {
    const parsed = new URL(trimmed);
    if (
      parsed.protocol !== 'https:'
      || parsed.hostname.toLowerCase() !== APPROVED_MERCHANT_HOSTNAME
      || parsed.username
      || parsed.password
    ) {
      return '';
    }
    return parsed.toString();
  } catch {
    return '';
  }
};
