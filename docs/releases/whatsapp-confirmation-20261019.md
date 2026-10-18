# WhatsApp confirmation release — 19 October 2026

## Root cause and scope

PR #154 was merged into main, but main lacked the currently deployed multi-day checkout lineage. The deployed Beta source is `8a3a3294026822ac505c674bd8d1a4ea184d9e3c`; Production is `969485e8120a7be680b675e93b6554c886d51ce4`. This candidate integrates the deployed Beta line and main, preserving the live checkout, payment and delivery implementations. Its application changes relative to live Beta are limited to the WhatsApp button, message builder and regressions.

Read-only inspection of Production order MC-1018-5RPA confirmed a `fulfilments` array with four independent date/time/address snapshots, dated 19–22 October at 15:30, and a confirmed payment amount of 9230 minor MYR units. Top-level pickup fields describe only the first day. The actual snapshots were rendered locally and verified without sending a message or modifying the order. Personal customer data is not committed as a fixture.

Messages now use every saved fulfilment, retain non-consecutive dates and exact times, use the recipient address for delivery and per-day pickup addresses for pickup, omit pickup codes for delivery, and obtain total paid/status/currency from the payment snapshot. Dates include the year and do not use time-dependent Today/Tomorrow labels. Store names come from the saved order.

## Validation

- TypeScript: passed.
- All frontend/model tests: 694 passed (including 14 WhatsApp regressions).
- Store payment/order history Firestore and Storage rules tests: 41 passed.
- Beta deployment safety tests: 53 passed.
- Beta-mode Vite build and Store shell preparation: passed, using published Beta configuration locally.
- Functions tests: 435 passed, two existing wall-clock-dependent delivery fixtures failed at Sunday cutoff. Their implementation files are unchanged relative to deployed Beta. Fixing only fixture clocks requires scope confirmation.

## Protected release sequence

1. Complete mandatory candidate CI and resolve the two test-fixture failures.
2. Use only protected Beta Release on main with the exact candidate SHA; obtain the beta environment reviewer approval. Do not approve the environment on the user's behalf.
3. Verify all resource deployment results, live release manifest/asset hashes and logged-in pickup/delivery single-/multi-day UI QA. Do not treat local rendering as deployed Beta QA.
4. Only after Beta passes, set the production environment `MISECHEF_PRODUCTION_APPROVED_SHA` to that exact tested SHA, preserving its protected baseline and other authority. The candidate includes the currently live Production ancestor.
5. Dispatch Production Release from main with the exact SHA and `RELEASE PRODUCTION`; obtain the production environment release approval, then verify the Production fingerprint and live UI.

Current status: neither environment has received this fix. Production approved SHA remains the existing live release. PR #154's prior Beta run 39143487111 is still waiting for beta review and represents a stale candidate; do not approve it as this fix. Beta environment build variables are absent and must be restored from verified published Beta configuration before deploying. No deployment gates were bypassed.
