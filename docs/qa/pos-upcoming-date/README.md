# Upcoming Orders date selection — Beta

Base: live Beta 0d6808a7aa6246b1cbe48fbc93e5e165e8cb7f26, verified 2026-11-25.

Audit: the live kitchen board had no date input and used date > today for Upcoming. The unified order browser reset Upcoming to tomorrow with a Day range and shared History controls. Neither offered compact weekday navigation. The realtime kitchen query already reads all active orders without a creation-date limit; order tickets already resolve actual fulfilment allocations and Weekly Menu daily snapshots. No data migration or query change is needed.

Implementation: shared Monday–Sunday control with weekday/date, previous/next week, native future-only calendar and selected-day highlight. Upcoming resets to tomorrow on entry. Live kitchen entries, legacy kitchen groups and completed summaries use the selected actual ticket date. The order browser uses the same control with a one-day query range. Today/History rules, status/payment/method controls, order actions and delivery logic are unchanged.

Validation: selector interaction/render tests; tomorrow (Nov 26), day after (Nov 27), next week (Dec 2), Nov/Dec and year boundaries; daily Weekly Menu item isolation; delivery and pickup; no-order date; terminal status exclusion; no mutation of fixture; Today/History compatibility. Existing POS, daily model, browser and tickets suites pass (74 tests including new tests); delivery/quote/destination/group kitchen/order model regression suites pass (38). TypeScript check and Vite Beta build pass. Protected full-resource release gate runs in CI. No real order data is created or modified for QA.

Scope excludes Invoice Processing, Ingredient Import, payment, pricing, quotation and booking changes. Production is not authorized.
