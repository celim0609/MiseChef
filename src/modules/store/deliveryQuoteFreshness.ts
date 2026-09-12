export const quoteHasSufficientLifetime = ({ expiresAt, minimumValidityMs, now = Date.now() }: { expiresAt: string; minimumValidityMs: number; now?: number }) => {
  const expiry = Date.parse(expiresAt);
  return Number.isFinite(expiry) && expiry > now + Math.max(0, minimumValidityMs);
};

export const customerDeliveryFeeChanged = (previousFee: number, nextFee: number) => (
  Math.round(Number(previousFee) * 100) !== Math.round(Number(nextFee) * 100)
);
