# Smart Delivery refinement — policy findings and Routes API investigation

Read-only findings checked 28 November 2026. No Google Routes calls, service activation, credential changes or billing changes were made.

## Why Beta showed RM0

The Beta Store `misechef-s-grab-go-store` uses Lalamove Sandbox, MY market and MOTORCYCLE. Its `delivery.fixedDeliveryBuffer` field is absent. The existing `fixedDeliveryBuffer` pricing helper therefore returns null. The original planner converts an absent policy to zero for both its buffer and extra-cost preview fields. The quotation and fee calculation correctly reuse the existing policy; the missing distinction was in presentation, not a vehicle exclusion or a wrong settings path. Store update time remained 2026-11-25T05:07:42.840311Z during inspection.

The existing policy is applicable only for MY Lalamove MOTORCYCLE, when explicitly enabled with valid integer-sen amounts. Disabled, missing, invalid and other-vehicle policies must not be silently activated. This refinement returns a read-only policy explanation alongside the unchanged calculations. The UI shows that no fixed-buffer policy is configured, and labels the maximum extra-cost policy as not configured instead of suggesting an active zero-cost protection limit. No Store settings or monetary defaults are changed.

## Existing capabilities

Repository inspection found Places search/resolution and Lalamove quotations; no Google Routes or Directions travel-time implementation. A read-only enabled-services inspection of the Beta project found Places API enabled and Routes API not enabled. Existing server OAuth/ADC patterns can be reused after appropriate API authorization. Browser Places credentials must not be repurposed as unrestricted server credentials.

## Recommended future integration (not implemented)

Use server-side Compute Routes for the exact manual and Lalamove-optimized stop sequences. Use kitchen pickup as origin, the last customer as destination and the remaining customer stops as intermediate stopovers. Request per-leg duration and distance, total duration, and the chosen vehicle/departure-time fields. This provides road-based estimates. Recalculate service/waiting time and customer-window feasibility locally, preserving saved customer times. Estimates remain predictions rather than guaranteed arrivals. Long service/waiting periods can require refreshed leg departure estimates and additional requests. Reuse identical sequence results within a single comparison where permitted, rather than issue duplicate calls. Lalamove remains the financial quotation authority.

Google waypoint optimization is optional, not needed for this approach: the sequences already come from the planner and Lalamove. Enabling Google optimization would create another candidate sequence requiring a new Lalamove quote and fresh window checks. Google optimization does not accept the planner's delivery windows as scheduling constraints. Matrix routing is unnecessary for comparing two complete sequences; it becomes useful only if a later scheduling/search algorithm needs pairwise travel times.

Requirements before implementation: enable Routes API on the approved Beta project; verify billing and runtime identity/OAuth or an API-restricted server credential; choose supported vehicle/routing preference and departure-time semantics; add a minimal response field mask, request quotas, bounded retries and clear unavailable/stale handling; satisfy Google Maps attribution and storage requirements. Do not assume Places activation also activates Routes. Do not persist road-duration data beyond permitted use. Motorcycle routing is supported in Malaysia and carries Google's beta-routing warning requirement. Test traffic/routing-preference compatibility for the chosen mode before relying on traffic-aware durations.

Sources: [Compute Routes](https://developers.google.com/maps/documentation/routes/compute_route_directions), [intermediate stopovers](https://developers.google.com/maps/documentation/routes/intermed_waypoints), [optimization limits](https://developers.google.com/maps/documentation/routes/opt-way), [OAuth setup](https://developers.google.com/maps/documentation/routes/get-api-key), [motorcycle coverage](https://developers.google.com/maps/documentation/routes/coverage-two-wheeled), [two-wheeler caveats](https://developers.google.com/maps/documentation/routes/route_two_wheel), [attribution and storage](https://developers.google.com/maps/documentation/routes/policies).

## Cost estimate

Published global pay-as-you-go prices, USD, first paid usage tier through 100,000 monthly events:

| Compute Routes SKU | Monthly free cap | Per 1,000 requests above cap |
|---|---:|---:|
| Essentials | 10,000 | $5 |
| Pro | 5,000 | $10 |
| Enterprise | 1,000 | $15 |

Traffic-aware driving triggers Pro; motorcycle routing triggers Enterprise. Compute Routes is charged per request, while Compute Route Matrix is charged per origin/destination element. A six-location full matrix is 36 elements, whereas checking two selected sequences takes two Compute Routes requests. Free caps are shared with other usage of each SKU on the same billing account.

Illustrative motorcycle estimate at two requests per comparison, assuming no other Enterprise usage: 1,000 comparisons/month = 2,000 requests, about $15 after the free cap; 3,000 comparisons/month = 6,000 requests, about $75. Taxes, currency conversion, existing Maps usage, Places usage and Firebase execution are excluded. Pricing for the actual selected request features must be confirmed before activation.

Sources: [current global price table](https://developers.google.com/maps/billing-and-pricing/pricing), [request/SKU billing rules](https://developers.google.com/maps/documentation/routes/usage-and-billing).

Routes integration requires separate approval after this requirements/cost report. The current milestone remains fixed-duration planning assumptions and Lalamove quotations only.
