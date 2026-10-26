# Production SHA authority resolution — 26 October 2026

Intended candidate: f006237f65c60d6a7d18a5970f3bfc53557db6b0, matching live Beta source tree 9469486349c39376db65e4d464b7721b255ad321. Protected Beta run 40183769832 succeeded; live desktop/mobile Week 1–3 upload/replacement/persistence checks passed, with 12 stored versions preserving source bytes. See ../week-cover-upload-live/README.md.

Prior Production run 40259145751 passed validation and received reviewer approval, then correctly failed before authentication at the approved-SHA equality check. Production remained 5965b3db695a84efdff3ea1c25305f5736a36127, matching the last successful run 40097062953. The environment authority had not been advanced from that previous release.

Following the user's explicit mismatch-resolution request and the protected sequence documented in docs/releases/whatsapp-confirmation-20261019.md, the environment variable MISECHEF_PRODUCTION_APPROVED_SHA was advanced to the exact Beta-tested f006237 candidate. Expected SHA already identified the correct candidate. Protected baseline, workflow and equality checks remain unchanged. No prior run was retried.

Fresh workflow: https://github.com/celim0609/MiseChef/actions/runs/40259926320 . Full fresh validation passed. Deployment is waiting for required human GitHub environment approval. No approval submitted on the user's behalf. No Production data writes, menu saves, orders, payments or Lalamove operations performed.

## Completed Production release

Human GitHub environment approval was recorded. Fresh run 40259926320 completed successfully, including the exact external-SHA check, full-resource deployment and controller post-deployment checks. Live Production manifest now reports f006237f65c60d6a7d18a5970f3bfc53557db6b0 / source tree 9469486349c39376db65e4d464b7721b255ad321. Served application bytes match the manifest SHA-256.

All three Full Set and all 15 daily links passed live browser checks at 1440px and 375px: correct ordering mode, original meal photos, names and prices. All 18 WhatsApp crawler responses have correct saved Production covers/daily photos, titles and selection URLs. Week 1 uses the original product photo; Weeks 2 and 3 retain their independently saved covers. Preview comparison uses the current pre-release menu snapshot; older October 24 QA expected different covers before the owner's later cover updates. Cache-version query differences are excluded when comparing image objects.

Production Admin has clean Replace Image controls for all three configured weeks, loaded saved previews, zero visible native inputs and no duplicated No file chosen display. All 18 Share actions displayed ✓ Copied! and copied the correct links; mobile Full Set feedback also passed. No upload or product save was performed in Production. Upload/replacement/persistence remain covered by the exact candidate's completed live Beta tests.

The real Production menu document is byte-for-byte equivalent as parsed JSON to its pre-release snapshot, including timestamps, photos, recipes, prices and discounts. No Beta QA record or image was copied. Historical Orders UI remains accessible (63 visible orders, including paid and pending payment statuses). Verification did not submit any order/payment/status/dispatch mutation. We did not have a pre-release snapshot of every order/payment record, so the preservation conclusion for those records rests on unchanged source, protected regression/deployment checks, absence of migration or test writes, and read-only UI visibility rather than a complete database comparison. Lalamove source is identical to the previous Production release: quotation/explicit booking confirmation remains manual; no booking was requested.

Evidence: completed-workflow.json, environment-approval.json, deployed-manifest.json, preservation.json, browser-results.json, live-metadata.json, admin-share-results.json, admin-covers.json, orders-read-only.json. Screenshots: production-desktop.jpg, production-mobile.jpg, production-mobile-controls.jpg.
