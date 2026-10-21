# Delivery mismatch and legacy booking compatibility

## Read-only Production evidence: MC-1020-DV47

Production inspected using bounded GET-only Firestore access and read-only Cloud Logging. The original document was not written, and no payment or provider booking was attempted.

- Order `fulfilmentMethod`: `delivery`.
- Daily fulfilment `day_20261022`: method `delivery`, date `2026-10-22`, time `11:30`; two allocated item lines.
- `delivery.schedule` agrees with that daily record.
- Customer full delivery address and both destination coordinates are present in `delivery.recipient`. The day lacks a separate `destination`, so it correctly inherits this immutable recipient snapshot.
- The day also retains Store pickup-location fields. Those identify the sender's pickup point, not the customer's fulfilment method or delivery address.
- Pickup code exists for identification. It is not evidence of Pickup.
- Payment is paid, parent status is New, daily operations and completion maps are empty, and dispatch is `not_requested`. No provider order ID or submission attempt is recorded.
- Saved sender contact and both coordinate pairs are present, as are original quotation/stop IDs and service type `MOTORCYCLE`.
- Saved recipient `phoneE164` actually contains the customer's local Malaysian phone, copied unchanged from `order.phone`. It lacks the international country code required by Lalamove. The raw customer number is deliberately not reproduced here.
- The original quotation expired on 20 October. Dispatch must request a fresh operational quotation and use its new stop IDs; it must not reuse the expired checkout quotation.
- Original document updateTime at inspection: `2026-10-20T06:45:33.025839Z`.

## Root causes

1. **Display mismatch:** Store Orders unconditionally rendered `Pickup {pickupCode}`, `Pickup Date`, `Pickup Time` and `Pickup Location` from parent collection fields. POS and tickets used the delivery day plus `delivery.recipient.address`. The stored order was already Delivery; its label was wrong.
2. **Confirmed booking-data defect:** checkout copied `draft.phone` directly into `delivery.recipient.phoneE164` without normalization. Dispatch forwarded it without contact/coordinate/service preflight. Lalamove requires an E.164 phone including region code: https://developers.lalamove.com/#phone-validation .
3. **Current operational block:** this day is New, not Ready. Paid status alone does not permit booking, and the fix does not change that requirement.
4. **Reported provider error is not conclusively attributable:** available callable logs contain a 422 `ERR_INVALID_FIELD` on 20 October at 02:42 UTC, but this order was created at 06:41 UTC. That error predates this order. There is no recorded dispatch for MC-1020-DV47; Firestore order-specific logs reviewed were reads/listeners. The exact reported missing-field event cannot be asserted from this evidence. Exact merchant message/time was requested. Older logs discarded field detail; new errors retain allowlisted field paths and request IDs.

## Fix and compatibility policy

- Shared pure per-day projection now drives Store Orders, existing POS/ticket projection and booking data. Explicit daily method/date/time/address wins; pickup code never determines type.
- Store Orders shows Delivery Date, Delivery Time and the full customer Delivery Address. Pickup location labels remain for genuine Pickup records. The code remains an identifier.
- A legacy day without its own address uses its saved recipient snapshot; no migration of the paid order is necessary.
- Dispatch normalizes a recognized Malaysian local mobile using the already-recorded MY country/MYR currency. Only the outbound booking payload changes; raw contact, immutable delivery snapshots, day allocations and money are untouched.
- Missing pins may be recovered only from an exact matching address in that order's saved quotation. A different per-day address never borrows the common pin. Missing names/phones/service data block booking with explicit field names; no Store-current settings or invented customer data are used.
- New delivery orders validate and save the normalized delivery phone before opening payment; the customer's original phone remains available unchanged.
- Payment/Ready checks, environment/tenant authority, concurrent transaction locks and uncertain-outcome locks remain enforced. Timeout or unknown provider outcomes are never automatically retried.
- Fresh quote IDs and both sender/recipient stop IDs are validated before booking. Provider errors return safe field paths and correlation IDs; no contact values, credentials or raw provider bodies are logged.

## Regression evidence

Synthetic `functions/fixtures/deliveryOrderCase.js` matches the essential case shape and contains no real customer names, contacts, addresses, document IDs or payment IDs. Tests cover Store Orders/POS/kitchen agreement, genuine Pickup labels, local phone normalization, unchanged paid snapshots, New/Ready eligibility, concurrent duplicate prevention, missing pin blocks before any provider call, exact-address pin recovery and safe provider-error diagnostics.

Firestore emulator integration persists this synthetic paid order, verifies New cannot dispatch, marks only its daily operation Ready, and performs one mocked booking under concurrent calls. No live Production data or provider/payment API is used in tests.

Local validation: 741 frontend/model tests, 478 Functions tests, 46 Store payment/order emulator tests and 53 Beta deployment safety tests passed; TypeScript and Beta-mode build passed. The protected gate validates the deployed-line ancestry and repeats the full regression/authorization suites for the immutable release candidate.
