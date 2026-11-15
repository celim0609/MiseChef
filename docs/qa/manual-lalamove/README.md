# Manual Lalamove dispatch

Supersedes automatic Ready/payment dispatch described in earlier delivery-flow QA.

## Behaviour

- Delivery progresses New → Preparing → Ready. Pickup shortcuts remain unchanged.
- The Firestore Ready trigger is intentionally inert. Payment and scheduled reconciliation cannot create bookings.
- POS Ready delivery cards and Store Orders use the same merchant booking component.
- Request Lalamove only quotes. Review shows service, exact pickup/drop-off, saved delivery time, actual booking time (including elapsed-slot immediate pickup), quotation ID, expiry and estimated MYR cost.
- Confirm requires a server-stored, merchant-bound, unexpired preview of the unchanged canonical day. It submits that exact quotation; no invisible repricing is allowed.
- Concurrent/repeated confirmation uses the transactional dispatch lock. Consumed previews cannot be reused after failure. Existing totals/payment/customer snapshots are not changed.
- Driver/tracking reconciliation remains read-only at Lalamove. It never submits replacement bookings.
- Explicit known 4xx booking rejections (including HTTP 402 wallet credit failures) are failures; transport/timeout/5xx outcomes stay locked. No blind retry.
- An unknown outcome with a known Booking ID is verified against the submitted quotation before attaching it. Without an ID or proven rejection it stays blocked and asks the merchant to check provider history/support using Request ID.
- Historical server-recorded ERR_INSUFFICIENT_CREDIT + Request ID + submitted quotation can be explicitly reconciled as a rejected request. This records an operational audit, never books. A new preview/confirmation is required after topping up.
- Legacy orders without saved per-day fulfilments fail closed with a reviewed-migration instruction. No dates, pins, contacts or customer data are invented.

## Production safety action (2026-10-22)

Production was already c95a514970d0909541a2c2f1537b0d89c3f4ef1f when this request began. Its automatic Ready trigger had attempted MC-1020-DV47 at 02:34 UTC and persisted ERR_INSUFFICIENT_CREDIT as outcome_unknown. No provider Booking ID is recorded. A second historical unknown order has no trusted providerCode and must remain locked without matching provider evidence.

Removed only Eventarc trigger `dispatchreadystorefulfilments-049768` in `asia-southeast1`, project `misechef-fa4bf`, to stop automatic invocation immediately. Verified no matching Eventarc trigger remains. No Production code deployment, paid-order edit, payment or real booking was performed during this task. The deployed application SHA remains c95. Do not redeploy that old candidate: a future explicitly approved Production release must include the inert trigger and merchant confirmation code.

Existing Production paid orders were inspected read-only. They were not reconciled/mutated during QA. The wallet rejection can be resolved by the merchant after this new code is explicitly approved for Production; top up the correct Lalamove account before a new quotation.

Provider contract checked against [official Lalamove Place Order reference](https://developers.lalamove.com/#place-order): HTTP 402 + ERR_INSUFFICIENT_CREDIT means the wallet must be topped up.

## Verification

- Unit/model suites cover no-auto selection, paid/Ready authorization, quote preview without booking, explicit confirmation, concurrent confirmations, changed routes, expiry, consumed preview, quote failures, provider timeouts, confirmed rejection and verified known-ID reconciliation.
- Anonymized DV47 emulator fixture advances Preparing → Ready → preview → concurrent confirmations, with one fake booking and immutable financial/customer snapshots.
- Browser harness uses actual shared POS/Orders components with mocked services. Request opened review at zero bookings; Cancel kept zero; explicit Confirm produced one mock booking and displayed Booking ID/rider/tracking. Real API calls: zero.
- Existing full regression suites cover POS, Orders, weekly orders, multiple destinations, free delivery, payment failures and ticket generation. No physical printing invoked.
