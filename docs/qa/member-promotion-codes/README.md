# Member Promotion Codes — protected Beta

Based on deployed Beta `354fb9ebbbf777d978f32de9ee0a6052b8a145b5`. Production is not authorized. No example code is auto-created or enabled, and no historical order is migrated or rewritten.

## Configuration and eligibility

Store → Promotions → Promotion Codes provides create/edit/disable, percentage, a maximum discount cap in RM, Members Only, per-member daily limit, absolute validity dates entered in Malaysia time, optional campaign total limit, counters, and the most recent 100 redemption audit records. Full audit records remain retained in Firestore. Renaming a code keeps its campaign ID, usage and audit history. Every admin edit has an immutable configuration audit entry. Owner/Manager authorization and business entitlement are enforced on the server.

Amounts use integer minor units; percentages use integer basis points. The example 20%, RM5 configuration is editable. Codes are case insensitive and scoped to a Store. The cap applies once to the eligible product subtotal of the entire order, including paid product options, before adding delivery fees. Percentage rounding occurs once; exact cents are allocated proportionally for daily delivery calculations. Final checkout compares the displayed code terms with freshly calculated server terms.

Members Only defaults on. Firebase callable authentication supplies membership identity; body UID/email/phone claims and anonymous Firebase identities cannot qualify. When the owner explicitly turns Members Only off, guests can use the campaign's total quota, while daily member limits still apply to authenticated members. Codes currently support MYR Stores.

## Option A — no replacement or stacking

Any actual Weekly Full Set saving, including preserved legacy package savings, rejects the code for the whole cart with an explicit Option A message. The code never replaces a Weekly Discount and never participates in a best-discount comparison. Existing automatic product discounts also reject the code. Sets, Group Orders and mixed carts containing discounts are rejected rather than partially or silently discounted. Full Sets with no weekly saving can be eligible. Daily menu lines keep their existing daily prices.

## Atomic payment lifecycle

Checkout reads the campaign index/configuration, member lock, daily bucket and campaign counters in the same Firestore transaction as order and checkout-attempt creation. The transaction reserves a global quota slot and, for a member, a daily slot. A member can have only one outstanding checkout per campaign, even when the configured daily success limit is greater than one. The member lock spans midnight so delayed captures cannot race a new-day checkout.

A successful payment atomically commits the redemption, payment state and usage counters. The successful MYT day comes from verified gateway payment timestamps, not browser time, UTC date, callback arrival time, or the original checkout day. A capture crossing midnight releases the original day's reservation and commits the payment day's bucket. The immutable pricing snapshot retains the preview/reservation day; the redemption audit stores the actual successful day and original reservation day separately. Repeated checkout attempts and webhooks do not reserve or commit twice. Later failed events cannot downgrade a paid order. Refunds do not restore successful redemption eligibility.

A browser expiry or retryable failed event never proves that the gateway can no longer charge. Code payment sessions have a one-hour expiry; the five-minute reconciliation worker releases usage only after verified terminal cancellation/expiry or definitive proof that provider creation failed. Cancelled sessions can be replaced with a fresh attempt. Ambiguous network/provider states stay reserved, are retried, and are marked for gateway review in admin history; confirmed failure never increments successful usage. No TTL deletes quota/audit evidence.

New code orders freeze `promotionCodeSnapshot` alongside their existing item, weekly, delivery and financial snapshots. Future menu/config edits do not change paid orders. Code configuration, indexes, member locks, daily buckets, reservation work queues (including recovery capabilities), and all audit collections are server-only; even Store owners cannot directly write them.

## Payment support and operational limits

- Stripe code sessions use expiring card checkout; ordinary Stripe checkouts retain their existing account-driven methods.
- Curlec code checkouts use Payment Links only when the existing rollout flag is enabled. Cancellation/expiry is confirmed by a fresh provider API read. Standard Checkout and manual payment methods reject codes clearly because their present lifecycle cannot safely release unpaid reservations.
- Gateway outages and ambiguous creation outcomes require reconciliation; the system conservatively retains a reservation rather than risking multiple paid redemptions. History shows these review cases. Recovery capabilities remain server-only.
- The expiry worker processes bounded batches; busy queues or provider outages can delay slot release after the nominal expiry.
- No live gateway payment or production data mutation is part of QA. Gateway calls in tests use mocks; Firestore contention tests use disposable emulator records.

Provider contracts: [Stripe session expiry](https://docs.stripe.com/api/checkout/sessions/expire), [Razorpay/Curlec Link cancellation](https://razorpay.com/docs/api/payments/payment-links/cancel-standard/), [Link lookup by reference](https://razorpay.com/docs/api/payments/payment-links/fetch-all-standard/).

## Regression verification

- `npm run lint`
- `npm run test:store-payments:model` (includes display, MYT admin dates and stale-preview coverage)
- `npm --prefix functions test` (includes integer pricing, cap, Option A, provider expiry and webhook timestamp coverage)
- `npm run test:store-payments:rules` (includes server-only access, actual checkout transactions, contention, daily/total limits, signed-in identity, midnight capture, idempotent retries, terminal release, immutable paid orders and delivery/code quote agreement)
- `npm run test:beta-deployment-safety`
- Trusted Beta capability validation, Beta Vite build, then the canonical protected CI Beta Release workflow.

The new transactional tests are imported by the existing protected order-history suite, so the immutable trusted gate runs them without changing release authority or baseline configuration.
