# POS-only Production candidate

Prepared from verified Beta e56168b as a descendant to preserve protected live-release ancestry. Production reference is 97230ff607c8af3825c59bbdc0517c625f0c015b. No Production action is authorized.

Includes approved POS Add Order/cart, Manual Order, reviewed multilingual Paste AI, address autocomplete and server-validated quotation, Owner/Manager scheduling, Weekly Plans, exact fees/payments, audited cancel/soft-delete, Owner Deleted Orders and immediately refreshed History.

Excludes new Group Delivery UI, public routes, reservations, review/approval, associated database indexes and feature code. Existing Production Host Group Orders remain unchanged. Public date eligibility implementations and existing test fixtures are restored to Production; new regression assertions preserve configured same-day ordering and blocked dates.

POS Places and rate limiting are extracted into posPlaces.js. Places resolves against the current verified Firebase project, rejecting unknown projects; rate limiting uses a server-only posQuoteRateLimits namespace. No Group Delivery business dependency remains.

Existing Beta pilot Function names remain as inert Beta-only compatibility shells to avoid destructive deletion during the protected full-resource release. Callables always reject and the scheduled handler does nothing; no orders, reservations, payments, quotes or bookings are read or mutated. Production exports none of those pilot Functions, verified by loading the actual module under both project identities. Existing pilot documents are preserved. This does not disable release or authorization gates.

Production rollback requires a new descendant corrective commit, protected Beta testing and fresh exact-SHA/environment approval; direct ancestor redeploy fails live-ancestry protection. Never restore the database over new customer payments or orders. Account for soft-delete tombstones and new manual fee audit fields before reverting behavior. Production approved SHA remains unchanged.

Validation and final deployed SHA are recorded in external evidence after protected Beta release and targeted browser QA. No Production deployment, migration, backfill, refund, payment charge or delivery booking is part of candidate preparation.
