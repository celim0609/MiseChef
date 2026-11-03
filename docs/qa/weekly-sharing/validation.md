# Weekly Menu sharing — 24 October 2026

PR: https://github.com/celim0609/MiseChef/pull/175

Latest application candidate: e613bfcf3626c94c7873204daff315d2850e54a0.
Beta release: https://github.com/celim0609/MiseChef/actions/runs/40071113281 — waiting for the protected beta environment reviewer. No approval gate was bypassed. Production was not deployed.

Existing core sharing release ad442819f97c00df48af0f2637e89b5ddddff030 successfully deployed through https://github.com/celim0609/MiseChef/actions/runs/39935765747. Its live fingerprint was verified before QA. Latest candidate changes button labels to Share Full Set / Share, adds exhaustive 18-link regression coverage, and fixes selected ordering-tab contrast in dark mode.

## Results

- 18/18 isolated share combinations pass: all three Full Sets and all fifteen daily links. Each checks exact rotation slot, ordering mode, date/day, distinct original photo/cover metadata, canonical query, unchanged base path, and no product mutation.
- 38/38 targeted sharing/social-preview tests pass; 10/10 ordering UI tests pass. TypeScript passed for the label/test update.
- Earlier deployed candidate's protected CI regression gate passed with no skips, including 517 Functions tests and 60 payment/rules/order-history integration tests.
- Live Week 1 Full Set and Monday–Friday links all rendered the exact selection in the browser. Full Set had 5-Day Plan pressed and five cards. Each daily link had Order by Day pressed, one correct dated card and original photo. No Add action was invoked; no order or payment was created.
- All six Week 1 raw crawler responses returned HTTP 200 with matching original image and query-preserving og:url. See live-metadata.json. This verifies server metadata consumed by WhatsApp; an actual WhatsApp message/cache refresh was not performed.
- Live product m8dDv9HVRZXSktZsiX4B contains only rotationWeeks.week1. Weeks 2 and 3 are absent, so their twelve live link checks cannot be completed against saved menus. They were tested using isolated fixtures only. No real menu was added or replaced to manufacture a passing result.
- Week-cover upload/replace and copy actions are implemented in the existing admin editor and covered by the prior model/rules suites; authenticated admin browser upload/clipboard QA remains pending.

## Preservation

Existing product ID and slug/base URL remain unchanged; only week/day query parameters select a menu. No data migrations or writes to real recipes, photos, prices, discounts, orders, payments or delivery settings were performed. Existing manual Lalamove behavior remains intact.

Screenshots show the already deployed core implementation, before the pending label/contrast update. beta-full-set.png and beta-friday.png show ordering content; other captures show the page header on the narrow browser viewport.
