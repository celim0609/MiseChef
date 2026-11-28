# Smart Delivery Phase 1 — internal Beta planner

The existing Owner/Manager Group Delivery section now opens a draft-only Smart Delivery planner. Legacy pilot records and services remain intact; this UI does not activate free delivery, customer checkout, payment, refunds, bookings or dispatch. Production is not enabled.

## Planning and quotation

- Defaults: 2km maximum pairwise customer separation, 30-minute manual window, five destinations, 60-minute planned route. All are configurable per draft. Comparison batches support up to ten destinations (28 quote requests), below the Sandbox 30/minute quota; a shared transactional 28-request budget reserves each batch and surfaces limits/errors without automatic retries.
- Manual addresses use existing server-side Places resolution. Saved delivery fulfilments are reloaded and authorized on the server; their exact times are strict, non-editable constraints. Multiple manual destinations may share a window. Saved orders are never edited. Order selection is bounded to the first 100 Store orders, with an explicit incomplete-list notice if truncated. No historical migration is performed.
- Every destination receives an individual Sandbox quotation. Each manual route prefix and each optimized prefix of two or more destinations receives an actual quotation. One-destination prefixes reuse the individual quote.
- Official `isRouteOptimized` is requested and the returned route sequence is checked against the requested pickup/destinations. Reordered stops are evaluated against every delivery window. Pickup schedule, service, currency, amounts, coordinates and expiry are validated. Source changes during quoting invalidate the result.
- Arrival times are explicitly planning assumptions: configured fixed travel minutes per leg, service minutes per stop and waiting. They are not road/traffic estimates or Lalamove arrival promises. Route duration and window failures reject the recommendation. Vehicle capacity and live traffic validation are outside this MVP.
- Comparisons expire at the earliest provider quote expiry. Editing the plan clears its comparison. No comparison authorizes a booking or a customer charge.

## Financial preview

The applicable existing MY Motorcycle fixed-buffer policy supplies one route buffer and exposes its maximum-extra-cost policy. This planner does not apply legacy free-delivery or merchant subsidy policies. Planned subsidy defaults to RM0. Proportional allocation uses individual provider costs as weights and deterministic largest-remainder sen rounding. Allocations conserve the quoted route cost plus buffer. Non-positive net savings or allocations above individual provider costs are not recommended. Customer savings are explicitly compared with individual provider quotes, not previously paid customer fees. Merchant exposure is a projection against proposed fees; no money is collected.

## Test-environment correction

The repository uses Node/tsx, with TypeScript-transpiled component harnesses, rather than Vitest. The initial test imported the service and eagerly initialized `src/firebase.ts`, whose `import.meta.env` requires Vite. The corrected test loads the actual component with the existing transpilation pattern and mocks only the delivery-service boundary. Unexpected imports or service calls throw. Assertions are retained. Firebase initialization and Vite configuration are unchanged.

The callable is isolated in `functions/smartDeliveryEndpoint.js` and re-exported from the existing Functions entry point. The accepted POS controller, pricing, checkout, permissions, Rules and indexes remain byte-identical. Tests retain the existing byte-preservation assertions.

## Evidence and release procedure

Actual Sandbox API checks obtained three individual quotes and four incremental manual/optimized quotes. Optimization was confirmed for two- and three-destination routes; the three-stop optimized route reordered destinations. Sandbox returned mock prices and is not evidence of Production savings. Request/response evidence is retained outside the repository without credentials.

Run the immutable protected gate, Group Delivery Firestore integration/privacy suite, Store Sets rules, deployment-safety checks, TypeScript and the protected Beta build. Release only through the protected Beta Release workflow with an exact committed SHA. Verify the manifest, assets, active callable and authenticated live desktop/mobile planner. No Production release is authorized by this milestone.
