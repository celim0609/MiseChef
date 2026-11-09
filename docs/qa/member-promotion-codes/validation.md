# Validation record

Local verification used the Functions project's required Node 22 runtime (`v22.23.4`).

- Store model/UI regressions: 405 passed.
- Functions, pricing, provider and checkout regressions: 508 passed.
- Firestore/Storage authorization and real transaction/order-history tests: 59 passed, including 11 new member-code transaction cases and the new server-only access regression.
- Deployment safety: 53 passed.
- Beta capability tests: 10 passed; trusted capability validation passed with additive Functions only.
- TypeScript lint and Beta Vite build passed. Protected Beta CI is responsible for the complete release-time regression gate, clean rebuild and full-resource deployment.

All payment-gateway interactions in tests were mocked. All transaction tests used the Firebase emulator. No real payment was initiated and no live paid order or menu configuration was edited.

The host-default Node 24 runs intermittently hit `INVALID_ARGUMENT: Transaction is invalid or closed` in the pre-existing manual POS contention test. The complete suite passed under the required Node 22 runtime. No POS production behavior or existing concurrency assertions were weakened or changed to bypass that failure.
