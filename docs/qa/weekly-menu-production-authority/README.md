# Production SHA authority resolution — 26 October 2026

Intended candidate: f006237f65c60d6a7d18a5970f3bfc53557db6b0, matching live Beta source tree 9469486349c39376db65e4d464b7721b255ad321. Protected Beta run 40183769832 succeeded; live desktop/mobile Week 1–3 upload/replacement/persistence checks passed, with 12 stored versions preserving source bytes. See ../week-cover-upload-live/README.md.

Prior Production run 40259145751 passed validation and received reviewer approval, then correctly failed before authentication at the approved-SHA equality check. Production remained 5965b3db695a84efdff3ea1c25305f5736a36127, matching the last successful run 40097062953. The environment authority had not been advanced from that previous release.

Following the user's explicit mismatch-resolution request and the protected sequence documented in docs/releases/whatsapp-confirmation-20261019.md, the environment variable MISECHEF_PRODUCTION_APPROVED_SHA was advanced to the exact Beta-tested f006237 candidate. Expected SHA already identified the correct candidate. Protected baseline, workflow and equality checks remain unchanged. No prior run was retried.

Fresh workflow: https://github.com/celim0609/MiseChef/actions/runs/40259926320 . Full fresh validation passed. Deployment is waiting for required human GitHub environment approval. No approval submitted on the user's behalf. No Production data writes, menu saves, orders, payments or Lalamove operations performed.
