# POS complete workflow — incremental verification

Base: `0e3fdad80a944c30a3088a47b7c59143c0350750`, the live protected Beta release verified on 2026-11-04 through `/.well-known/misechef-beta-release.json` (build `9807429f-44fa-4d4e-9ad7-fafb157959b4`). Production and Group Delivery are outside this change.

## This increment

Manual Order now reuses `PosAddressPicker` and the existing authenticated quote-only POS endpoint. Staff explicitly distinguish store delivery from customer-arranged delivery. Only store-delivery lines participate in provider quotations, free-delivery thresholds and customer delivery charges. The shared quotation code accepts the existing canonical manual-order builder and normalizes per-date destinations, including all five dates of full-week plans. It never calls a booking API.

Manual fee overrides require existing Owner/Manager authorization, an exact bounded amount and an audit reason. Provider cost remains unknown for manual fees. Pending orders include merchandise, delivery and grand totals in the saved financial/payment amount. Payment confirmation still requires explicit receipt, the saved revision and exact amount. Customer-arranged delivery carries no automatic fee. Changing quote-bound data or letting a quote expire requires refreshing it. Saved manual override amounts/reasons survive reopening a pending draft.

Manual save retries bind their request ID to the submitted payload. Canonical items are rebuilt inside each transaction attempt so a retried quotation check does not compare against a previously decorated fulfilment. Existing pickup/customer-arranged fulfilment IDs remain stable. Editing away a store-delivery fee removes its obsolete snapshot while preserving its timeline audit.

Weekly defaults use one shared helper: full-week selections inherit only a valid Monday; explicit individual meal dates remain unchanged. No existing customer orders are migrated.

## Verification

- TypeScript: pass.
- Frontend/model: 450 passed, including rendered Weekly Plan Monday/default-time checks.
- Functions: 600 passed.
- Firestore/Storage + order history: 63 passed. An earlier run encountered an emulator `Transaction is invalid or closed` during the existing concurrent manual save test. The focused concurrent test passed, then the complete suite passed. The new payment integration test was corrected to supply the existing required revision and exact received amount.
- New integration coverage: real Firestore transaction for manual quotation → pending order → explicit payment confirmation, server-resolved coordinates, exact totals, idempotency, changed schedule rejection and no booking calls.
- Live existing Beta: Add Order non-Monday main date leaves all Weekly Plan Monday inputs blank; a valid Monday populates them; main exact time is inherited. No order was created during this check.

## Remaining work / release status

This is an incremental candidate, not completion of the full request. Manual Order schedule/layout consolidation, Paste Order, cancellation/deletion permissions and compact history are still pending. The new increment has not been deployed or subjected to live Beta/mobile QA. No phase is declared complete by this document.
