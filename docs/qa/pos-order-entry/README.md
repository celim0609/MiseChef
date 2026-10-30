# POS paid order entry and weekly menu QA

## Root causes and implementation

Both the external-order callable and dialog required name/phone except for Walk-in.
All paid POS sources now accept missing contacts (provided contacts still validate).
The saved source, payment label, platform-paid state and external reference remain.
A stable request ID provides server idempotency even without a platform reference;
changed payload reuse is rejected. The existing external-reference reservation and
synchronous UI submit lock remain. No payment charge/capture is introduced.

External orders previously used only the item builder, omitting weekly meal snapshots
and daily allocations. A dedicated external scheduling projection now calls the shared
Store fulfilment/item/meal-option builders for each scheduled line. Configured weekly
package prices apply once per quantity, with actual dishes allocated across five days.
Dated individual meals use their configured day price/options. Regular Sets expose
configured group choices/upgrades. Store availability, blocked dates and time slots
are validated server-side; no menu or price is hardcoded.

Add Order now has catalog search, Products/Sets/Weekly menus categories, visible week
and time selection, independent catalog/cart scrolling, editable quantities/dates,
optional contacts, and a persistent Confirm Order footer. Clearing a draft is explicit;
failed submissions retain their request identity. Required choices/date errors block
confirmation. Submission disables editable order details.

## Verification

- Server-model tests cover five-day allocations, package quantities/prices, mixed dates,
  configured sets/upgrades, individual dated dishes and unavailable schedules.
- Kitchen ticket regression uses actual external-order snapshots and checks each day's
  dish/quantity without printing the weekly parent as one meal.
- Firestore integration covers ShopeeFood, Walk-in and Other with blank contacts,
  paid status/reference preservation, concurrent retries without a platform reference,
  changed request rejection and unauthorized operators.
- Concurrent emulator submissions exposed code 3 "Transaction is invalid or closed"
  during a contended query. Only that precise transient condition receives bounded
  application retries using the same idempotency ledger and order reference. The test
  itself is not retried, weakened or skipped.
- Actual local browser fixture: configured weekly menu/date picker; MYR60 package,
  quantity 2 = MYR120; Confirm enabled with blank ShopeeFood contacts; catalog search
  and set group choices. At 390×844 the Confirm button occupies y=750–798, within the
  viewport. This uses isolated mock services, not live customer/order/payment data.

The exact final candidate must pass TypeScript, Beta build, protected baseline/live
fingerprint validation and the immutable full Beta Candidate security/regression gate.
Deploy exclusively through protected Beta Release with required human approval.
Candidate-specific live Beta acceptance follows deployment. Production is not authorized.
