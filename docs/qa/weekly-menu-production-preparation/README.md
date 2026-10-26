# Production release preparation — 26 October 2026

Candidate: `f006237f65c60d6a7d18a5970f3bfc53557db6b0`.
Workflow: https://github.com/celim0609/MiseChef/actions/runs/40259145751

Protected validation passed: exact candidate checkout, immutable baseline gate, complete trusted regressions, Store Sets Firestore authorization, and Production controller safety tests. The Production deployment job is waiting for required GitHub environment approval by celim0609. Administrator bypass is disabled. No environment approval was submitted, and the external approved SHA remains the existing Production SHA; both authorities must match before deployment can proceed.

The candidate matches live Beta and its recorded desktop/mobile upload, preview, replacement, persistence and clipboard tests. Relative to current Production, runtime changes are limited to StorePage.tsx, WeekCoverUpload.tsx and WeeklyMenuShareButton.tsx. Existing sharing routes, compact customer layout, backend, storage helper, prices and delivery logic are unchanged.

No Beta QA data or images are copied by this workflow. No Production data writes or deployment occurred during preparation. The Production manifest was checked again after validation and remains identical, SHA `5965b3db695a84efdff3ea1c25305f5736a36127`. Recipes, photos, prices, discounts, orders, payments, URLs and manual Lalamove dispatch remain unchanged.
