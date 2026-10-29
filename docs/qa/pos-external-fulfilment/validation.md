# POS manual external fulfilment

Candidate starts from live Beta source `5ad8fb98c9ad16f60124a772477e6c20a55725a4`, verified against the deployed release fingerprint on 2026-10-25. Production is not authorized.

ShopeeFood, WhatsApp, Walk-in and Other support Delivery/Pickup, optional customer name/phone, order default date/time, and independent item schedules. Selected weekly menu dates and five-day allocations remain server-validated. New explicit schedules accept exact HH:mm values. Delivery address is stored in the shared canonical destination and recipient snapshots used by Orders/POS and both ticket formats. Existing clients without the new method retain immediate-order behavior.

Externally arranged deliveries have an explicit server-created marker. Their kitchen days can progress Preparing → Ready → Completed without a Lalamove order. They do not display Lalamove booking controls, and the booking backend rejects such requests. Existing online Lalamove orders keep manual preview/confirmation and provider-controlled delivery completion. Automatic dispatch remains inert.

Prices remain catalog-derived; payment labels/statuses and discount behavior are unchanged. No historical data migration or mutation is included. The transactional retry fingerprint includes the new fulfilment details; client synchronous locking and server request/platform-reference ledgers remain in place.

Local validation:
- TypeScript check passed.
- Store payment/model/UI tests: 411 passed.
- Functions tests: 538 passed.
- Firestore/Storage rules and transactional integration tests: 61 passed. Includes concurrent submissions for all four external sources, optional contacts, multiple dates and exact times, no provider calls, independent day completion, and unchanged payment/items/totals.
- Deployment safety tests: 53 passed; capability tests: 11 passed.
- Vite Beta build passed; Store social app shell preparation passed. Generated shell is rebuilt by protected CI, not committed from local output.

Beta deployment must use the existing protected Beta Release workflow with the immutable candidate SHA, external baseline authority, full-resource deployment and environment approval. Production remains excluded.
