# Compact checkout promotion UI

Presentation-only change based on deployed Beta 37a57e24c4a854131e1008d04f3c464bbf43b8ad. No payment handlers, pricing calculations, promotion eligibility, member checks, reservation lifecycle, or stored order fields changed.

The input and Apply button share a shrinking flex row, with optional terms in a native disclosure. Sign-in, remove, stale-preview and server validation messages remain available. The applied snapshot retains code, percentage, cap, discount, product total and delivery exclusion.

## Validation (2026-10-23)

- Node 22.23.4: TypeScript lint passed.
- Store/payment model tests: 405/405 passed, including weekly and member promotion regressions.
- Functions tests: 508/508 passed.
- Firestore/Storage rules and checkout integration emulators: 59/59 passed.
- Deployment safety: 53/53 passed; Beta capabilities: 10/10 passed; protected capability contract passed.
- Browser checks with actual checkout promo JSX copied into a temporary local fixture using application CSS and the real PromotionCodeSummary. Tested empty/guest, Option A validation error, applied capped discount and checking states. Fixture had no network/payment handlers or live customer data and was removed before release.
- Desktop viewport 1440px, 720px summary: input/Apply aligned, all states without overflow.
- Mobile viewports 320px and 375px with page/card padding: no document or section horizontal overflow; terms expand/collapse; input and button remain usable; compact messages wrap; applied cap/discount and total visible. Screenshots are local fixture evidence, not a live checkout purchase.
- Final bold discount styling was followed by repeat lint and member promotion summary tests (3/3 passed).

No real payments were created and no paid orders were modified. Production is outside this release.
