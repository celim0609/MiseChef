import { httpsCallable } from "firebase/functions";
import { functions } from "../../../firebase";
export type PlannerLimits = {
  distanceKm: number;
  slotMinutes: number;
  maxDestinations: number;
  maxDurationMinutes: number;
  legMinutes: number;
  serviceMinutes: number;
};
export type PlannerDestination = {
  id: string;
  label: string;
  placeId?: string;
  address?: string;
  orderId?: string;
  fulfilmentId?: string;
  confirmedTime?: string;
  windowStart: string;
  windowEnd: string;
};
export type PlannerDraft = {
  date: string;
  pickupTime: string;
  limits: PlannerLimits;
  destinations: PlannerDestination[];
};
export type PlannerQuote = {
  quotationId: string;
  feeMinor: number;
  expiresAt: string;
  sequence: string[];
  providerOptimized: boolean;
  timing: {
    feasible: boolean;
    durationMinutes: number;
    arrivals: Array<{
      id: string;
      label: string;
      arrival: string;
      windowStart: string;
      windowEnd: string;
      withinWindow: boolean;
    }>;
  };
};
export type PlannerPreview = PlannerQuote & {
  totalMinor: number;
  savingsMinor: number;
  providerSavingsMinor: number;
  merchantExposureMinor: number;
  economical: boolean;
  recommended: boolean;
  bufferMinor: number;
  maximumExtraCostMinor: number;
  allocations: number[];
};
export type PlannerComparison = {
  pricingPolicy?: {
    status:
      "applied" | "missing" | "disabled" | "vehicle_not_applicable" | "invalid";
    serviceType: string;
    configuredBufferMinor: number | null;
    configuredMaximumExtraCostMinor: number | null;
  };
  expiresAt: string;
  createdAt: string;
  draft: PlannerDraft;
  individual: PlannerQuote[];
  routes: Array<{
    count: number;
    individualTotalMinor: number;
    incrementalMinor: number;
    manual: PlannerPreview;
    optimized: PlannerPreview | null;
  }>;
  arrivalBasis: string;
  pricingNotice: string;
};
async function call<T>(
  storeId: string,
  workspaceId: string,
  data: object,
): Promise<T> {
  if (!functions) throw new Error("Smart Delivery is unavailable.");
  return (
    await httpsCallable<unknown, T>(functions, "planMiseChefSmartDelivery", {
      timeout: 540000,
    })({ storeId, workspaceId, ...data })
  ).data;
}
export const smartDeliveryService = {
  search: (
    storeId: string,
    workspaceId: string,
    input: string,
    sessionToken: string,
  ) =>
    call<{ suggestions: Array<{ placeId: string; label: string }> }>(
      storeId,
      workspaceId,
      { action: "search", input, sessionToken },
    ),
  orders: (
    storeId: string,
    workspaceId: string,
    date: string,
    limits: PlannerLimits,
  ) =>
    call<{ destinations: PlannerDestination[]; truncated: boolean }>(
      storeId,
      workspaceId,
      { action: "orders", date, limits },
    ),
  compare: (storeId: string, workspaceId: string, plan: PlannerDraft) =>
    call<PlannerComparison>(storeId, workspaceId, { action: "compare", plan }),
};
