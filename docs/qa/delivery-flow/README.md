# Delivery completion audit

Base: Production and live Beta `98649c6dd735dd6b703465069005ae5902317a1b`.
Branch: `fix/delivery-flow-completion`.

## Existing behavior verified

- Google Places selection plus editable full unit/floor address exists.
- Server owns products, promotions, payment totals and checkout attempt identity.
- Dispatch requires paid status and Ready kitchen status, checks tenant role and provider environment, and claims a per-day transaction lock.
- Unknown create-order outcomes remain locked; manual retry is safe only before external submission.
- Provider status reconciliation runs every five minutes. Weekly plans already have independent completion records.
- Pickup, manual POS, Ready to Sell, weekly menu and printing retain their existing behavior.

## Actual gaps and fixes

1. Zero-day delivery settings permitted same-day checkout. Server and checkout now require tomorrow or later in Malaysia time. This means one calendar day, consistent with Store dates and weekly Sunday cutoffs.
2. Weekly delivery required identical times. Delivery days now have independent times; pickup retains its shared time.
3. All dates inherited a single recipient. Optional per-day Places selection and full address are persisted in each fulfilment, included in quote binding and used by dispatch and existing tickets.
4. Checkout multiplied the first provider quote by the number of days. It now quotes every date/route, sums actual fees, and evaluates free-delivery thresholds and configured subsidy against each day's discounted merchandise. All provider quotations are revalidated at payment.
5. Distance was checked only for the common address; configured limits now apply to every destination. Invalid explicit limits fail closed. Legacy Stores lacking a limit retain compatibility.
6. Multi-day dispatch did not enforce a requote absorption guard. New orders retain per-day provider costs; increases above RM5 block dispatch without charging the customer again.
7. No automatic multi-day dispatch existed. A paid, ready fulfilment triggers its initial dispatch. Transactional locks arbitrate concurrent manual/automatic requests. Failed initial attempts require operator review and manual retry; uncertain submissions never resubmit.
8. Per-day refresh omitted tracking links and rider fields; Orders and POS now show them. Rider records omit unavailable coordinates rather than writing Firestore `undefined`.
9. Invalid quote expiry could bypass comparisons; malformed expiry now fails checkout.

## Verification

All payment and delivery providers in tests are mocks; Firestore authorization/integration uses demo emulators. No real payment, provider quotation or Lalamove booking was created.

Covered: normal delivery, five-day plans, different dates/times/addresses and fees, free-delivery tiers after promotions, distance rejection, quote failures, changed quotes, duplicate payment attempts, unpaid/failed payment dispatch rejection, concurrent dispatch, timeout after provider acceptance, database write failure after acceptance, manual pre-submission retry, per-day cancellation/completion and tracking.

Operational limit: a provider timeout with no returned booking ID requires merchant reconciliation with Lalamove. The system deliberately blocks replacement; it cannot prove that no booking exists. No automatic refund, extra customer charge or replacement booking occurs.

Local results: 739 frontend/model tests, 469 Functions tests, 45 Store payment/order emulator tests, 53 Beta deployment safety tests passed. TypeScript validation and Beta-mode build passed. The protected CI release repeats the full mandatory regression and authorization suites before deployment.
