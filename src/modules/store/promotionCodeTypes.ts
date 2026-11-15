export interface PromotionCodeConfig {
  id: string;
  storeId: string;
  code: string;
  active: boolean;
  membersOnly: boolean;
  percentageBps: number;
  capMinor: number;
  dailyLimit: number;
  totalLimit: number | null;
  startsAt: string;
  endsAt: string | null;
  revision?: number;
  redeemedCount?: number;
  reservedCount?: number;
}
export interface PromotionCodeSnapshot {
  version: number;
  codeId: string;
  code: string;
  percentageBps: number;
  percentage: number;
  capMinor: number;
  membersOnly: boolean;
  dailyLimit: number;
  totalLimit: number | null;
  businessDate: string;
  resetTimeZone: string;
  conflictPolicy: "A";
  eligibleSubtotalMinor: number;
  uncappedDiscountMinor: number;
  discountMinor: number;
  capApplied: boolean;
  finalMerchandiseMinor: number;
  currency: "MYR";
  configRevision: number;
  reservationExpiresAt?: string;
  startsAt?: string;
  endsAt?: string | null;
}
export interface CodeRedemption {
  requiresReview?: boolean;
  lastCheckedAt?: string | null;
  id: string;
  orderId: string;
  memberUid: string;
  businessDate: string;
  state: string;
  createdAt: string;
  updatedAt?: string;
  pricingSnapshot: PromotionCodeSnapshot;
}
