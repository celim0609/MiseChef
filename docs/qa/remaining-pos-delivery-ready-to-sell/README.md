# Remaining POS, delivery and Ready to Sell verification

## Diagnosis and changes

The existing `f4993ac` Orders controls and `0696317` single POS period navigation
are retained. Orders status filtering now intersects each daily fulfilment's status
with the selected period instead of testing the parent status. Filter changes remove
hidden selections; notification focus selects a matching period once rather than
continually restoring stale selection. Workspace changes reset the view.

Lalamove Beta credentials, fixed Sandbox host, authentication, MOTORCYCLE service,
Google Places selection and public Checkout quotation were exercised successfully.
The public checkout returned RM9.60 delivery / RM9.70 total for a MYR0.10 catalog
item and a public destination. These checks did not create a payment or booking.
There was no reproduced credential/configuration failure, so credentials and Store
settings were not changed.

Confirmed code defects: the legacy single-order dispatch requotation omitted the
future preorder schedule, and a lost booking response was retryable as `failed`.
Dispatch now retains the UTC preorder time, validates the quotation, checks the
provider environment before claiming, persists submission intent and locks ambiguous
submissions as `outcome_unknown`. Known provider IDs remain reconcilable. Existing
multi-day dispatch, distance restrictions, paid/kitchen gating and RM5 legacy
absorption limit remain. All booking tests use mocked providers.

Provider HTTP/auth/service/route/schedule failures now return safe actionable
callable errors with diagnostic IDs; provider requests have a bounded timeout.
No secrets are logged. See the [Lalamove scheduling contract](https://developers.lalamove.com/).

Ready to Sell opened, saved and reopened a linked complete-nutrition Recipe in live
Beta with the expected 515 kcal value and copied image. The temporary product was
saved unavailable and removed with its two copied images after verification. No
existing Recipe, ingredient, customer order or product was modified.

Confirmed code defects: the editor awaited nutrition before opening, lacked a
saved-photo preview, and Store reloads fetched only 50 products. The draft now opens
immediately; photo and nutrition load independently, stale requests cannot overwrite
another draft, and late nutrition preserves user edits/manual photo choices. Saving
waits for initial transfers. Only complete calculations populate numeric calories.
The saved photo remains visible on reopen and all workspace products load on reload.

## Regression and release checks

Focused tests exercise daily/period filtering, actual asynchronous Ready to Sell
handler behavior, saved-product reload past 50 items, nutrition completeness,
preorder dispatch, environment isolation, invalid quotes, duplicate-submission
protection and safe provider errors.

Run TypeScript, all frontend/model and Functions tests, the immutable protected Beta
Candidate gate including mandatory Firestore/Storage suites, baseline/live fingerprint
validation and the Beta build for the exact final commit. Use only the protected Beta
Release workflow with the required environment approval. Verify the candidate in
Beta after deployment. Production is not authorized.

No live dispatch acceptance was performed because testing must not create delivery
bookings. A merchant-controlled dispatch check remains a release acceptance step.
