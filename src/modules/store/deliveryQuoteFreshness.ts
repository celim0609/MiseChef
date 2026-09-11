export const quoteHasSufficientLifetime = ({ expiresAt, minimumValidityMs, now = Date.now() }: { expiresAt: string; minimumValidityMs: number; now?: number }) => {
  const expiry = Date.parse(expiresAt);
  return Number.isFinite(expiry) && expiry > now + Math.max(0, minimumValidityMs);
};

export const scheduleDeliveryQuoteRefresh = ({ expiresAt, minimumValidityMs, now = Date.now(), schedule, onRefresh }: { expiresAt: string; minimumValidityMs: number; now?: number; schedule: (callback: () => void, delayMs: number) => ReturnType<typeof window.setTimeout>; onRefresh: () => void }) => {
  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry)) return null;
  return schedule(onRefresh, Math.max(0, expiry - now - Math.max(0, minimumValidityMs)));
};
