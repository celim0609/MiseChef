# Group Delivery Phase 1 — Beta candidate

Pilot: Pakatan / Bercham Raya. 1,000 metre straight-line radius. Ten eligible lunch portions per Store and delivery date. English and Simplified Chinese. Customer delivery charge is **RM0 after approval**, with no shared-cost allocation.

## Center verification

The user corrected and confirmed the pilot center on 1 November 2026: **44, Laluan Pakatan Jaya 3, Pakatan Jaya, 31150 Ipoh, Perak**, latitude **4.6413277**, longitude **101.1445881**. These provided Google Maps pin coordinates are authoritative; the prior center and its Place ID have been removed. See `center-verification.json`. This is the area eligibility center only: no kitchen pickup, Store delivery origin, POS or Lalamove pickup configuration is changed.

The existing spherical Haversine utility uses a mean Earth radius of 6,371 km. Eligibility uses the unrounded distance and an inclusive 1,000 metre threshold, with one micrometre of floating-point tolerance at the exact boundary. Independent forward-geodesic fixtures cover 0, 999.9, 1,000, 1,000.01, 1,000.1 and 1,500 metres in eight directions. Display rounding never makes an outside pin eligible.

## Behavior and activation

- Customer entry: `/store/<slug>/group-delivery?date=YYYY-MM-DD`. Store displays a promotion link only when configured future dates are open.
- Sign in is required to search/check addresses and reserve. Joining creates only a private unpaid reservation, never a Store order, payment, kitchen ticket or Lalamove booking.
- An active Business workspace Owner/Manager opens the settings panel on that page, explicitly marks eligible **main lunch meals** and portions per unit, selects available dates and MYT cutoffs before 11:00, then enables the pilot. Settings are callable-only; geography, ten-portion minimum and RM0 fee cannot be overridden by inputs. No live configuration or customer data was changed during development.
- Eligible meals are explicitly allowlisted single main meals without legacy Store options, and embedded Healthy Lunch day meals from existing dated/rotation plans. Full-week bundles, Store Sets and legacy single-product option groups are deferred. Meal options add price, never portions. An allowlisted multi-portion main-meal unit can explicitly count more than one portion.
- Menus use canonical Healthy Lunch resolution, option snapshots and Store/product blocked-day rules. Selections cannot contain duplicate product lines, fractional/negative quantities or arbitrary client portion/price claims.
- Server credentials resolve Google Place IDs and validate Malaysian coordinates. Client coordinates and address labels are ignored. The same exact distance check runs again when reserving. OAuth uses the existing Beta runtime service account and Places API (New), without exposing a server key or adding credentials.
- One reservation per signed-in customer per Store/date. Transactional writes and request fingerprints handle concurrent submits/retries. Cancel and rejoin replaces the quantity rather than adding a second reservation. Unknown network outcomes retain the same client request ID for retry.
- Every reservation expires at its configured date cutoff. Reads/counts enforce expiry immediately, including the exact deadline, regardless of scheduled cleanup. Transaction retries recheck the clock after address resolution. A 15-minute scheduled job materializes expired status in batches of 250.
- Counts are unpaid **intent**, with no kitchen inventory hold. Ten portions changes the public display to ready for review only. Approval, payment invitations, payment links, confirmed orders and delivery bookings are outside Phase 1.
- Public responses whitelist only pilot/menu/progress fields. Signed-in customers receive only their own reservation status/portion count/deadline. No shared response includes customer addresses, names, phones, unit details, UIDs or request tokens. Firestore denies direct access to all new documents, including for owners; manager configuration uses authorized callables.
- Phase 1 requires neither Curlec nor Lalamove calls. Existing checkout, Host Group Order, independent orders, POS and payment code paths remain unchanged. Runtime wrappers reject the Production project.
- Pilot limit: 100 customer reservation records per Store/date. Address APIs have a shared 30 requests/minute/account limit and five function instances. Duplicate customer accounts are outside the one-account duplicate guarantee.

## Validation

All local checks passed on 1 November 2026:

| Check | Result |
| --- | --- |
| Immutable trusted regression gate `9c2173b9f9ae42b1fc09826c57cef46697759452` | Passed, no skips |
| Frontend/model tests in full gate | 813 passed |
| Functions tests in original full gate | 574 passed; rerun after correction recorded below |
| Protected Recipe / Resume / Chef Profile / Personal Expenses / Store Payment & Order rules | 29 / 2 / 21 / 8 / 61 passed |
| New reservation integration + privacy suite, after final backend fixes | 12 passed |
| Store Sets rules | 5 passed |
| Beta deployment safety tests | 53 passed |
| TypeScript | Passed |
| Vite Beta-mode build | Passed; existing bundle-size advisory |
| Local browser fixture | Meal selection, address eligibility, unpaid join at 10 portions and private status verified |

The new integration suite uses a disposable `demo-misechef-group-delivery` Firestore emulator. It exercises actual concurrent transactions and rules, including duplicate joins, changed-payload retries, cancellation/rejoin, exact expiry, delayed cleanup, lookup crossing cutoff, paused configuration, forged coordinates, unavailable meals, Owner/Manager authorization, policy override rejection, privacy and absence of Store/payment side effects.

The earlier screenshots were removed because they displayed the superseded center. The original local UI fixture checked reservation behavior; it is not live Beta evidence. Local Node was v24; the protected workflow remains authoritative on Node 22 and Java 21. The workflow now adds the new integration/privacy suite before authentication/deployment, without changing any approval or baseline gate.

## Release boundary

Source starts at live Beta `97230ff607c8af3825c59bbdc0517c625f0c015b`, independently read from `/.well-known/misechef-beta-release.json`. The ordinary main branch is divergent and must not overwrite that live line. Review/deploy this exact candidate through the protected **Beta Release** workflow with `expected_candidate_sha` and required approval. Do not merge to main as a shortcut: main pushes trigger deployment.

No deployment was started while preparing this candidate. No Production reads/writes/deployments were used for this feature. After an approved Beta release, select eligible products and dates as Owner/Manager, verify real signed-in Places searches in both languages, join/cancel using disposable QA reservations, and verify a public share link before inviting pilot customers. Never create real payments or bookings for Phase 1 QA.

## Corrected-center verification

Corrected-center checks passed: 8 focused backend unit tests, 2 UI/route tests, 576 Functions tests, 441 Store model tests, 13 reservation/privacy integration tests, TypeScript and the Beta-mode build. Protected baseline validation is also required for the revised clean commit. New coverage checks all eight radius directions, exact inclusion at 1,000 m, rejection at 1,000.01 m, backend revalidation for corrected-center customer addresses, and preservation of the existing Store kitchen pickup configuration. The earlier candidate is superseded; the revised exact commit remains subject to approval. No release has been initiated.
