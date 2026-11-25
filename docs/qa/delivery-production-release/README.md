# Delivery release preparation — Production approval required

## Source and scope

Production baseline: `7d60ac8f85a9a88878658571bb2afed459d6614b` (source tree `3df24fe734c3c049580e444a2db93da0f108974a`). Accepted Beta: `0d6808a7aa6246b1cbe48fbc93e5e165e8cb7f26`, based on Beta `3df5b2e6e9cd144e3f26d756730bddd405eefea0`.

Do not deploy the whole Beta tree: it has 130 changed files versus live Production, including unrelated Group Delivery, payment, history, and preview changes. This candidate instead transplants only accepted commits `4418ef2` (pricing disclosure), `01902e8` (time integrity) and `0d6808a` (compact checkout) onto live Production. Conflict resolutions retain Production's `posAddOrder.js` import and exclude Beta-only Group Delivery links. Every per-file added/removed line across the 29 accepted feature files matches the accepted Beta delta exactly.

Only additional changes are this release/rollback plan and three narrowly scoped byte-pin exceptions in `functions/isolatedPosScope.test.js` for the intentionally modified Public Store page, delivery validation and fulfilment validation. All other Production pins remain unchanged. No Rules, indexes, Storage rules, deployment controller/workflows, environment settings, payment providers, payment calculations, buffer calculations, manual booking, cancellation, legacy-history preparation or weekly-preview resources are changed.

## Validation

Local: TypeScript, 899 frontend/model tests, 646 Functions tests (including preserved Production-specific tests), 24 Production controller safety tests and the Production-configured application build. Exact candidate additionally runs the validation-only protected workflow, using its immutable trusted baseline/capability gate and full mandatory Firestore/Storage authorization regression suites. This does not dispatch Production Release or grant Production deployment approval.

Delivery coverage includes Owner/Manager-only immutable daily pricing disclosure, missing-data behavior, estimates versus completed actual-cost balances, saved price protection limits, five-day sums, the unchanged raw-quote-plus-buffer calculation, time propagation, explicit override preservation/confirmation, reset and reopen, final resolved times, quotation UTC schedule binding, backend rejection before payment/provider lookup, authorized school arrangements and denial of forged Chef authority. Compact rows and Friday/footer clearance were accepted in Beta; shared feature delta is identical in this Production descendant.

The exact Production descendant differs from the live accepted Beta SHA because unrelated Beta work is excluded; do not describe this new full tree as the exact live Beta-tested build. It receives independent protected CI and Production build validation. It has not been deployed to either environment during preparation.

## Deployment approval boundary

Report the final immutable candidate SHA and CI result before requesting explicit Production approval. Do not dispatch `deploy-production.yml`, change `MISECHEF_PRODUCTION_APPROVED_SHA`, approve the Production environment, run `deployProduction.mjs`, perform Firestore writes/backfills or place provider bookings during preparation. Order MC-1125-UQXH is excluded from all mutations. Existing accepted orders, payments and pricing snapshots are not migrated.

After explicit approval, the release owner must bind Production approval to the exact candidate SHA, retain the externally configured protected baseline, and use the canonical full-resource Production Release controller from main. Recheck live Production fingerprint before dispatch; if it has changed from the baseline, stop and rebase/revalidate. The actual Production release independently reruns its mandatory regression/controller gates and generates/verifies an exact-source Production artifact; source changes invalidate approval.

## Rollback plan

Before deployment, retain the baseline manifest, source tree, entry asset/hash and full resource configuration. Prepare a forward rollback commit descended from the final candidate, reversing these delivery commits and the release-preparation pin/plan commit. Verify its Git tree is exactly the baseline Production tree. A stale baseline checkout must not bypass the controller's live ancestry requirement.

If post-release validation fails, pause rollout and obtain explicit approval for the exact forward rollback SHA. The release owner updates only the approved-SHA authority after approval and uses the same canonical protected full-resource Production workflow. Recheck Hosting/source/asset coherence, Functions exports, Rules parity and representative read-only Store and merchant screens after rollback. Do not restore Firestore backups, rewrite orders, change settings, delete quote snapshots, cancel delivery bookings or replay payments. No data migration is part of this release, so no data rollback is required. Future quote audit fields are additive and safely ignored by prior code. New checkout sessions may need to refresh their quotes after rollback; existing paid schedules and charges remain their accepted snapshots.
