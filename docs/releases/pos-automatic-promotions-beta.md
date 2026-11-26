# POS automatic promotions functional correction

Beta-only correction based on live Beta b80c5f797a8efa682779e2af2db83273c549b4ad.

## Audit

POS used the existing promotion engine with `excluded: !input.manualDiscount`: automatic offers were excluded for ordinary saves, but evaluated when manual discount was requested and rejected as stacking. Frontend previews excluded offers, and ordinary Add Order items lacked the promotable basePrice. This explains original-price previews plus backend promotion conflicts.

Read-only catalog audit: Production Mochi Cake Series is active: Pistachio Fig Mochi Cloud RM18.90 -> RM14.90 and Durian Mochi cake RM24.90 -> RM20.90 at quantity one. Production Banana Muffin B1F1 is expired. Beta Banana Muffin B1F1 is active, but quantity one earns no free unit. Eligibility still depends on current dates, quantity, minimum merchandise subtotal, product identity and protected Weekly/Set lines. Eligibility alone is never a saving.

## Implementation

Add Order and Manual Order use one POS composition of the existing product promotion calculator. Scoped calculation terms are returned through the existing callable with authenticated POS role checks; Firestore Rules are unchanged. Actual winning promotions apply automatically. Original and promotional cart prices and separate automatic/manual summary amounts are shown.

Owner/Manager must explicitly keep, replace or stack when actual automatic savings exist. Stacking applies manual percentage to the remaining eligible product subtotal. Weekly Discounts and Set offers are protected. Inactive, expired, scheduled or unmet promotions do not block manual discounts. Delivery is excluded from all discount bases.

Server recomputes canonical catalog pricing, validates the reviewed cents and promotion terms, and freezes combined line adjustments plus separate totals and authorized manual choice. Existing payment, revision and idempotency protections remain. Existing paid orders and snapshots are not migrated or recalculated. Receipt/customer invoice and WhatsApp show split discounts; Sales Records and accounting continue consuming reconciled combined canonical adjustments.

No changes to delivery quoting, RM2 buffer, payment providers, Firestore Rules, settings, Invoice Processing, Ingredient Import or POS visual refinement. Historical audit entries retain their existing non-promotional path.

## Validation

Local: TypeScript and Beta Vite build passed; 916 frontend tests and 731 backend tests passed. New tests cover valid/inactive/expired/future/quantity/subtotal eligibility, automatic application, keep/replace/stack, unauthorized requests, over-discounts, exact-cent allocation, option surcharges, Weekly/Set protection, scoped term projection, stale-preview rejection, pending and paid save parity, source-price immutability, receipts, WhatsApp, Sales Records and accounting.

Protected Beta CI and live verification are recorded in the release response. No Production deployment is authorized by this task.
