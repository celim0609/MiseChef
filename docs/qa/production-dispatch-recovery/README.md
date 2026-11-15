# Production release 39898429769 recovery

## Root cause and actual partial deployment

Read-only Production control-plane audit after the failed 23 October 2026 release:

- Hosting's active release is still `sites/misechef-fa4bf/versions/07d9965ba7c4df3f` (21 October). Both live manifest and application identify `c95a514970d0909541a2c2f1537b0d89c3f4ef1f`; failed candidate files were uploaded but not released.
- 61 Functions remain deployed. 60 are ACTIVE; the legacy `dispatchReadyStoreFulfilments` is UNKNOWN with EventarcTriggerNotFound. None have an updateTime on the failed-release date.
- The legacy function metadata has no eventTrigger. Its missing trigger is named `projects/misechef-fa4bf/locations/asia-southeast1/triggers/dispatchreadystorefulfilments-049768`. Its Cloud Run service has a ready revision. Firebase classifies the incomplete function as HTTPS and therefore rejects a Firestore-triggered candidate with the same name.
- The downloaded legacy source archive's index.js is byte-identical to c95a514's source and declares onDocumentWritten with automatic booking code. The declaration was introduced in commit 3a2de1c; the weekly pricing/member-code changes did not introduce this trigger type. The later Beta line made it inert, but preserved its Firestore transport. The audit establishes missing-trigger metadata drift; it does not establish who removed the Eventarc trigger.
- Firestore rules DID release from candidate 30d2d26: live SHA256 `ede3f3f2cfd7a825fcf6ee36eb2717fa6f667864a465c8cd4ab4797c1ca2a9f1`. Rules now include weekly configuration and server-only promotion collection protection while the application/functions remain older.
- Index definitions DID deploy: 14 versus the previous candidate's 13. The added storePromotionCodeReservations index was CREATING at first audit; remaining indexes were READY. This is additive and does not rewrite documents.
- Storage rules were released but content is unchanged from c95a514. SHA256 `1e5f500c873650b41d9f995e4659a3783cb8b036795f51155f28e58675821966`.
- The two observed Scheduler jobs are expireWorkspaceTrials and reconcileLalamoveSandboxDeliveries; neither invokes the legacy dispatch endpoint. No repository application caller references it. Current merchant dispatch calls dispatchStoreLalamoveDelivery. The missing Eventarc trigger and lack of scheduler invocation prevent the legacy event route from receiving automated dispatch events; no endpoint or booking API was invoked during investigation.

Full sanitized resource snapshots and source-archive evidence are retained locally outside the candidate checkout in MiseChef-release-recovery-audit. No customer documents were read or mutated for this control-plane audit.

## Compatibility correction

Keep the same function name and URL without deletion. Production exports a private, retired HTTPS handler returning 410 MANUAL_DISPATCH_REQUIRED and no side effects. Beta retains its existing Firestore-triggered identity with an inert handler. Both have no Lalamove secrets or booking-provider access. No replacement background function is needed. Production's malformed function can be updated in place as the HTTPS family Firebase currently recognizes; Beta requires no trigger migration.

Project identity is resolved from Firebase's project environment and checked for conflicts. Unknown or malformed deployment identities fail closed. Node unit-test imports can expose only the retired inert HTTP transport. Merchant dispatch remains the existing authenticated preview, confirmation, and idempotent booking path. Reconciliation never creates a booking.

Regression tests load the real Firebase entry.js SDK endpoint manifest for BOTH projects and compare every previously deployed function's trigger family against the control-plane snapshot (61 Production, 66 Beta). They also execute both retired handlers with hostile request/event objects to prove no input/order interaction, and reject conflicting project configuration. Conditional function definitions remain visible to the candidate capability scanner; no baseline or release authority is weakened.

Protected release procedures and mandatory environment approvals are unchanged. Full validation, corrected Beta deployment, Production approval and post-release audits are recorded separately as they complete. Do not declare recovery complete until Hosting, every Function including the retired endpoint, both Rules releases and all indexes are verified against the corrected release.

## Local validation

Node 22: TypeScript lint passed; 405 Store/model tests, 512 Functions tests, 59 Rules/order integration emulator tests, 53 Beta deployment safety tests, 11 Beta capability tests and 24 Production controller safety tests passed (1,064 total). The final private-HTTPS metadata option was followed by another 4/4 real-manifest/handler regression run. Protected capability validation passed with all 35 protected and 65 index.js Functions retained, plus renderPublicRecipe from entry.js. No source functions were removed.
