export const PERSONAL_EXPENSE_MERCHANT_MAX_LENGTH = 120;

const HTML_OR_ANGLE_BRACKET_PATTERN = /<[^>]*>|[<>]/;
const LINE_BREAK_PATTERN = /[\r\n]/;

export const sanitizeExtractedMerchant = (value: unknown) => {
  if (typeof value !== 'string') return '';
  const merchant = value.trim();
  if (!merchant) return '';
  if (merchant.length > PERSONAL_EXPENSE_MERCHANT_MAX_LENGTH) return '';
  if (LINE_BREAK_PATTERN.test(merchant)) return '';
  if (HTML_OR_ANGLE_BRACKET_PATTERN.test(merchant)) return '';
  return merchant;
};

export const validateMerchantForSave = (value: unknown) => {
  if (typeof value !== 'string') return '';
  const merchant = value.trim();
  if (!merchant) return '';
  if (merchant.length > PERSONAL_EXPENSE_MERCHANT_MAX_LENGTH) {
    throw new Error(`Merchant / Supplier must be ${PERSONAL_EXPENSE_MERCHANT_MAX_LENGTH} characters or fewer.`);
  }
  if (LINE_BREAK_PATTERN.test(merchant)) {
    throw new Error('Merchant / Supplier must be a single-line business name.');
  }
  if (HTML_OR_ANGLE_BRACKET_PATTERN.test(merchant)) {
    throw new Error('Merchant / Supplier must be a business name without HTML or angle brackets.');
  }
  return merchant;
};
