# Production Weekly Menu sharing — 24 October 2026

PR: https://github.com/celim0609/MiseChef/pull/175
Production SHA: `5965b3db695a84efdff3ea1c25305f5736a36127`
Workflow: https://github.com/celim0609/MiseChef/actions/runs/40097062953
Result: successful. Protected release controller confirmed the exact SHA at 2026-10-24 13:19:51 UTC (21:19:51 Malaysia time). The live manifest on misechef.ai matches the tested Beta candidate. Functions, Hosting, Firestore rules/indexes and Storage rules were released through the protected Production controller.

The required production environment review was recorded by the authorized `celim0609` reviewer account based on the user's explicit Production approval, after the pre-deployment checks passed. Environment protections were not modified. See environment-approval.json.

## Protected validation

All 1,437 tests passed, with no failures or skips: 753 application/model tests, 535 Functions tests, rule/integration suites of 29 + 2 + 21 + 8 + 60 tests, 5 Store Sets authorization tests, and 24 Production deployment safety tests. Immutable trusted baseline/capability validation, exact approved SHA, clean build, live Production ancestry/fingerprint, resource compatibility, Firestore parity and post-deployment checks passed through the controller.

The manual-dispatch regression checks passed, including retired transports being unable to book/read/modify orders and automatic dispatch remaining disabled for payment, Ready, unrelated updates and failures. No dispatch was initiated during QA.

## Real Production verification

Existing product ID: `UYbflYMUINI5sqyqrPIO`.
Existing base URL: https://misechef.ai/store/misechef-s-grab-go-store/product/week-1-menu-UYbflYMUINI5sqyqrPIO

All 18 actual links passed at 1440px desktop and 375px mobile: 36 browser cases. Each Full Set selects 5-Day Plan and displays the exact week's five saved meals. Each daily link selects Order by Day and displays only the exact meal/day. All meal names, daily prices and image source URLs match the pre-release Production snapshot. Mobile has no horizontal page overflow. Screenshots preserve the compact thumbnail and approved premium card design, aligned desktop cards and complete Add action.

| Week | Original total | Discount | Final Full Set | Link checks |
| --- | --- | --- | --- | --- |
| 1 | MYR 67.50 | MYR 7.50 | MYR 60.00 | Full Set + Mon–Fri pass |
| 2 | MYR 67.50 | MYR 7.50 | MYR 60.00 | Full Set + Mon–Fri pass |
| 3 | MYR 68.50 | MYR 6.50 | MYR 62.00 | Full Set + Mon–Fri pass |

Week 2 is currently outside the existing ordering availability window. Its six links show the correct saved menu and ordering mode with the existing unavailable notice and disabled ordering. Weeks 1 and 3 are orderable. Availability and service dates were not changed to make QA pass.

All 18 raw crawler responses returned HTTP 200 with the exact query-preserving og:url, correct daily title and configured original image. All 15 original daily image URLs return HTTP 200 with image content. No separate week covers are currently saved in Production; all three Full Set previews correctly use the existing original product cover fallback. Admins can upload separate covers using the shipped feature. Actual WhatsApp delivery, cached preview refresh and messages were not performed; server-side Open Graph responses consumed by WhatsApp were verified.

## Data preservation

The complete Production Weekly Menu document, including its update timestamp, is byte-equivalent after canonical JSON normalization before and after release. See data-preservation.json for the hash. Product ID and base URL are unchanged; week/day selections use query parameters only. All original recipes, prices, discounts and photo references remain intact. No order, payment, cart or booking action was invoked. No Beta menu, QA fixture or test data was copied to Production. The release makes no changes to checkout, payment or manual Lalamove business logic.

Evidence: release-manifest.json, browser-results.json, mobile-browser-results.json, metadata-results.json, original-photo-checks.json and screenshots for all three Full Sets plus a representative daily mobile page.
