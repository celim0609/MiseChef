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

## Additional implementation

Manual Order now has Customer & Fulfilment, Product Selection, Cart & Order Summary, and Payment & Confirmation sections. Ordinary new lines inherit the main schedule/address; explicit overrides and Weekly Plan schedules remain independent. Loaded/pasted multi-date drafts retain their explicit schedules. Immediate pickup is an explicit Owner/Manager action. Quotes refresh after eligible draft changes, with a single in-flight request and stale-response binding.

Both Add Order and Manual Order expose the same Paste Order preview. The new authenticated, rate-limited callable uses the existing Gemini service with no tools/actions. It bounds input/output, validates and whitelists model output, matches exact catalog names only, and returns no payment status or order mutation. Missing/ambiguous values, price conflicts, deadlines and model evidence discrepancies are shown for review. Applying requires explicit review and opens the existing manual Pending Payment checkout. English, Chinese and Malay fixtures cover validation; live extraction accuracy still requires QA.

Cancel and Delete are separate More Actions. Deletion checks current roles/payment state in a transaction: Owner may delete paid/unpaid orders; Manager may delete unpaid orders; Chef cannot delete. Both cancellation and deletion require a reason and explicit confirmation. Deletion preserves fulfilment status, totals, payment, refunds and provider data and appends a single audit record. It hides tombstones from operational queries/tickets and blocks stale fulfilment/payment/dispatch actions. The Owner-only Deleted Orders callable reads a server-maintained paginated index; clients cannot write the index or AI usage counters. Financial completed-order queries retain soft-deleted sales, including refund accounting.

Completed-order cancellation remains on its existing terminal-state policy to avoid reversing recognized revenue through an operational action. Grouped delivery orders remain on their existing workflow. No provider booking/refund/cancellation is triggered by these management actions.

## Candidate status

This candidate is not yet deployed. Live Beta AI, end-to-end order management, responsive/mobile QA and full protected workflow verification remain required. No phase is declared complete by this document.
