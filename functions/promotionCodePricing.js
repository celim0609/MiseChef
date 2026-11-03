// Pure shared validation/pricing. No browser-supplied price or membership claim
// is accepted by the server callers of these functions.
export const promotionCodeError = (message) => {
  throw new Error(`Promotion code: ${message}`);
};
export const normalizePromotionCode = (value) =>
  typeof value === "string" ? value.trim().toUpperCase() : "";
export const malaysiaPromotionDay = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
export const validatePromotionCodeConfig = (config) => {
  if (!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(config?.code || ""))
    return "Use a code of 3–32 letters, numbers, underscores or hyphens.";
  if (
    typeof config.active !== "boolean" ||
    typeof config.membersOnly !== "boolean"
  )
    return "Choose active and membership settings.";
  if (
    !Number.isInteger(config.percentageBps) ||
    config.percentageBps < 1 ||
    config.percentageBps > 10000
  )
    return "Percentage must be between 0.01 and 100.";
  if (
    !Number.isSafeInteger(config.capMinor) ||
    config.capMinor < 1 ||
    config.capMinor > 10000000
  )
    return "Enter a maximum discount between RM0.01 and RM100,000.";
  if (
    !Number.isInteger(config.dailyLimit) ||
    config.dailyLimit < 1 ||
    config.dailyLimit > 100
  )
    return "Daily member limit must be between 1 and 100.";
  if (
    config.totalLimit !== null &&
    (!Number.isSafeInteger(config.totalLimit) || config.totalLimit < 1)
  )
    return "Enter a positive total redemption limit or leave it blank.";
  if (
    !Number.isFinite(Date.parse(config.startsAt)) ||
    (config.endsAt !== null &&
      (!Number.isFinite(Date.parse(config.endsAt)) ||
        Date.parse(config.endsAt) <= Date.parse(config.startsAt)))
  )
    return "Choose valid start and expiry dates.";
  return "";
};
export const assertPromotionCodeEligible = ({
  config,
  memberUid,
  now = new Date(),
  currency = "MYR",
}) => {
  if (
    !config ||
    validatePromotionCodeConfig(config) ||
    !config.active ||
    Date.parse(config.startsAt) > now.getTime() ||
    (config.endsAt && now.getTime() >= Date.parse(config.endsAt))
  )
    promotionCodeError(
      "This code is invalid, disabled or outside its validity dates.",
    );
  if (currency !== "MYR")
    promotionCodeError("This code is available for MYR Stores only.");
  if (config.membersOnly && !memberUid)
    promotionCodeError(
      "Sign in with a registered member account to use this code. Guest and anonymous checkout are not eligible.",
    );
};
export const pricePromotionCode = ({
  items,
  pricing,
  config,
  memberUid,
  now,
  currency,
  groupOrder = false,
}) => {
  assertPromotionCodeEligible({ config, memberUid, now, currency });
  if (groupOrder) promotionCodeError("Codes cannot be used with Group Orders.");
  if (items.some((item) => item.weeklyPriceSnapshot?.discountAmount > 0))
    promotionCodeError(
      "This Weekly Full Set already has a Weekly Discount. The code cannot replace or stack with it (Option A). Remove the code to keep your Weekly Discount.",
    );
  if (
    items.some((item) => item.itemType === "set") ||
    pricing.discountTotal > 0
  )
    promotionCodeError(
      "This cart already contains a discounted item or Set. Codes cannot stack with other offers. Mixed-cart code eligibility is not supported; remove the code to keep existing offers.",
    );
  const lineMinor = items.map((item) => Math.round(item.lineTotal * 100));
  if (
    !lineMinor.length ||
    lineMinor.some((value) => !Number.isSafeInteger(value) || value < 0)
  )
    promotionCodeError("Review your cart prices.");
  const subtotal = lineMinor.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(subtotal) || subtotal < 1)
    promotionCodeError("Your eligible product subtotal must be positive.");
  const percentageMinor = Number(
    (BigInt(subtotal) * BigInt(config.percentageBps) + 5000n) / 10000n,
  );
  const discountMinor = Math.min(subtotal, config.capMinor, percentageMinor);
  if (discountMinor < 1)
    promotionCodeError("The eligible subtotal is too small for this code.");
  // Largest remainder allocation preserves exact cents for daily delivery pricing.
  const allocated = lineMinor.map((value, index) => ({
    index,
    amount: Number((BigInt(value) * BigInt(discountMinor)) / BigInt(subtotal)),
    remainder: (BigInt(value) * BigInt(discountMinor)) % BigInt(subtotal),
  }));
  let extra =
    discountMinor - allocated.reduce((sum, row) => sum + row.amount, 0);
  for (const row of [...allocated].sort((a, b) =>
    a.remainder === b.remainder
      ? a.index - b.index
      : a.remainder > b.remainder
        ? -1
        : 1,
  )) {
    if (extra-- > 0) row.amount++;
  }
  const snapshot = {
    version: 1,
    codeId: config.id,
    code: config.code,
    percentageBps: config.percentageBps,
    percentage: config.percentageBps / 100,
    capMinor: config.capMinor,
    membersOnly: config.membersOnly,
    dailyLimit: config.dailyLimit,
    totalLimit: config.totalLimit,
    businessDate: malaysiaPromotionDay(now),
    resetTimeZone: "Asia/Kuala_Lumpur",
    conflictPolicy: "A",
    eligibleSubtotalMinor: subtotal,
    uncappedDiscountMinor: percentageMinor,
    discountMinor,
    capApplied: percentageMinor > config.capMinor,
    finalMerchandiseMinor: subtotal - discountMinor,
    currency: "MYR",
    configRevision: config.revision || 1,
    startsAt: config.startsAt,
    endsAt: config.endsAt,
  };
  return {
    ...pricing,
    discountTotal: discountMinor / 100,
    discountedMerchandiseTotal: (subtotal - discountMinor) / 100,
    promotionCodeSnapshot: snapshot,
    promotionSnapshot: {
      version: 1,
      appliedPromotions: [],
      lineAdjustments: allocated.map((row) => ({
        productId: items[row.index].productId,
        productName: items[row.index].productName,
        quantity: items[row.index].quantity,
        originalLineTotal: lineMinor[row.index] / 100,
        discountAmount: row.amount / 100,
        finalLineTotal: (lineMinor[row.index] - row.amount) / 100,
      })),
    },
  };
};
