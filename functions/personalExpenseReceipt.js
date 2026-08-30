export const PERSONAL_EXPENSE_MERCHANT_MAX_LENGTH = 120;

const MAX_MERCHANT_WORDS = 16;
const HTML_OR_ANGLE_BRACKET_PATTERN = /<[^>]*>|[<>]/;
const LINE_BREAK_OR_CONTROL_PATTERN = /[\r\n\u0000-\u001f\u007f]/;

export const sanitizeExtractedPersonalExpenseMerchant = value => {
  if (typeof value !== 'string') return '';
  const merchant = value.trim();
  if (!merchant) return '';
  if (merchant.length > PERSONAL_EXPENSE_MERCHANT_MAX_LENGTH) return '';
  if (LINE_BREAK_OR_CONTROL_PATTERN.test(merchant)) return '';
  if (HTML_OR_ANGLE_BRACKET_PATTERN.test(merchant)) return '';
  if (merchant.split(/\s+/).length > MAX_MERCHANT_WORDS) return '';
  return merchant;
};
