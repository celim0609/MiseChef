# POS Manual Discount — separate Beta milestone

Base: deployed Upcoming selector milestone af335bcfffb8cb60e6b7c41dea0ba3f56ba76534, verified against live Beta on 2026-11-25.

## Audit and reuse

Manual POS and externally paid Add Order previously hard-coded discountTotal=0. Existing Store promotions/code pricing already uses totals.merchandiseSubtotal, discountTotal, discountedMerchandiseTotal and promotionSnapshot.lineAdjustments. Sales Records, daily revenue and business accounting consume those totals/adjustments; customer WhatsApp confirmations use the shared saved order breakdown. Reuse these fields and the same exact-cent allocation, extracted to storePromotionPricing.js for both promotion codes and manual discounts. No separate ledger or discount collection is introduced.

## Behavior

Owner/Manager can Apply Discount, choose fixed RM or percentage, supply an optional reason, edit or remove before payment. Fields are inline in Add Order and Manual Order. Server recomputes prices and discount, checks transaction-time role authority and reviewed discount cents, rejects malformed/negative/excess discounts and stacking with active promotions, Weekly Discounts, codes or Sets. Removing/editing a discounted pending order also requires Owner/Manager. New snapshot records original subtotal, type/value, actual discount, final merchandise/payable amount, reason, authorizing UID and time. Existing pending-order revision/idempotency and paid-order protection remain in force. Payment links must be cancelled before editing. Weekly pending drafts can be revised only using their same Weekly POS mode and existing future-date validation.

Delivery quotes/fees operate on the original canonical items and remain unchanged. Discounts are subtracted from food/products only. Applying a discount does not invalidate a manual order delivery quote. RM-only controls match this milestone's currency requirement. Historical audit orders cannot receive manual discounts.

Legacy receipt amounts use the existing shared breakdown and display unavailable values explicitly instead of assuming a zero charge. Thermal receipts and customer invoices (Print Tickets or paid manual details) show subtotal, discount, delivery fee and payable separately. Customer invoice printing reuses the paid receipt renderer; it does not touch supplier Invoice Processing. WhatsApp, Sales Records and financial reports reuse existing saved breakdowns and canonical line adjustments.

## Validation

- Full local frontend/model suite: 914 passed; full Functions suite: 721 passed before the final additional full-food-discount payment test.
- Targeted backend suite including the Weekly POS edit/link safety test: 45 passed, including apply/edit/remove, Owner/Manager, forged/inactive role rejection, stale amount, promotion conflicts, paid edit protection, retries, exact-cent allocation and delivery exclusion.
- Targeted frontend includes inline role gating, preview math, receipt/invoice/WhatsApp breakdowns, Sales Records and business-accounting reconciliation, and multiple daily fulfilments.
- TypeScript and Beta Vite build pass. Protected CI reruns all regression and authorization tests and performs the full-resource Beta deployment.
- No migration of existing orders; no changes to supplier Invoice Processing or Ingredient Import; no Production deployment authorized.
