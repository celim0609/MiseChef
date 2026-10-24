# Shared Weekly Menu layout — 24 October 2026

PR: https://github.com/celim0609/MiseChef/pull/175
Application candidate: 5965b3d (contains b202a7b).
Protected Beta workflow: https://github.com/celim0609/MiseChef/actions/runs/40091658173 . Waiting for the beta environment reviewer at the time this report was written. Production was not deployed.

## Change

Only Weekly Menu standalone pages use a compact left cover: 176px square at 1440px and 144px at 1024px. The menu receives the remaining width with min-width protection. Mobile stacks the capped-height cover above the menu. Other standalone product types keep their existing layout.

The premium menu cards, source images, names, prices, subgrid rows, ingredient disclosures and options remain unchanged. The weekly summary can wrap its Add action when space is tight. Selected ordering tabs now use the actual existing theme button classes so dark mode displays white text on the existing green button rather than white on white.

No menu selection, pricing, discount, cart, order, payment, dispatch, product ID, URL, metadata or backend logic changed. No real data was written. Lalamove remains manual only.

## Browser QA

Local Vite candidate connected read-only to the existing Beta catalogue, tested through Chrome using the real PublicStorePage and HealthyLunchMenu. No fixture replacement was used for layout screenshots.

| Width | Meal cards | Cover | Add 5-Day Plan |
| --- | --- | --- | --- |
| 1440 | five across, equal 180.4px width and 271.8px height | 176px square | complete 146px × 48px button |
| 1024 | five across, equal 132.6px width and 275.9px height | 144px square | complete 146px × 48px button |
| 375 | one column, equal 270px width | height capped at 192px | full-width 244px × 48px button |
| 320 | one column, equal 215px width | 179.3px height | full-width 189px × 48px button |

No horizontal page overflow at any width. Cards have readable full names and prices. Desktop screenshot shows all five cards and the complete pricing/Add row. Mobile screenshot includes every card and the complete Add row. Dark selected tab computed colors: white text on rgb(45,90,61).

Live deployed Beta e613bfc was checked separately for preservation: all six saved Week 1 links passed on both 1440px desktop and 375px mobile (12 browser cases). Full Set selects 5-Day Plan and five meals; daily selects Order by Day and exactly the matching day. Saved meal names and original photo URLs were compared directly with a read-only Firestore snapshot. Results: live-browser-links.json.

All six raw crawler responses returned HTTP 200, original image URLs and the complete week/day og:url; see ../weekly-sharing/live-metadata.json. This checks the server metadata consumed by WhatsApp; no WhatsApp message was sent and no third-party cache refresh was attempted.

The real Beta product still contains only week1. Week2/week3 are absent. All 18 combinations pass isolated unit tests, including exact dates/modes/images and unchanged URL path, but twelve live cases cannot be verified until the corresponding menus are saved. No real menus were created to manufacture test results.

## Automated checks

TypeScript passed. Vite Beta-mode build passed. Targeted sharing/social metadata tests: 38/38 pass (including all 18 requested link combinations). Weekly ordering UI tests: 10/10 pass. The protected CI workflow runs the full mandatory release regression gate before deployment. PR validation and environment approval status are available on the workflow/PR.

Screenshots are of the local candidate before deployment, using original saved Beta data. desktop-menu.jpg and mobile-menu.jpg focus on the product section; full-page captures are also included.
