# Compact Weekly Menu UI — 23 October 2026

Based on live Beta 89d5b855b67b0f5173454c5769adeeabab58cfc8. Presentation only: state, option selection, validation, week resolution, weekly pricing and surcharge computations before the render block are byte-identical to the base. All onChange/onAdd payloads, disabled conditions and arithmetic remain unchanged. No backend business source, Rules, indexes, payment, checkout, delivery, pickup or confirmation code changed.

Five original-image cards use a 4:3 cover crop, shared grid rows on desktop and a single column below 1024px. Native ingredient disclosures retain the original description text in full; meal names are not truncated. Native option disclosures retain the existing option component and required groups start open. The week selector and ordering tabs share a compact toolbar. The summary shows original price, discount and final total, including the existing selected-option surcharge. The Add 5-Day Plan action remains a 48px full-width button on mobile.

## Browser verification

Used the real HealthyLunchMenu component and application CSS inside a disposable localhost fixture with the original authorized Week 2/3 recovery meal/image/option snapshots. The fixture used local onAdd payload capture only; no Firebase writes, payments, booking requests or live menu changes. It was removed before commit/build.

- 1440px: all five cards share the same y=187, width about 223.6px and height about 336.2px in the nested Store-like container.
- 1024px: all five cards share one row, equal widths/heights, no card overflow.
- 320px and 375px: single-column cards, original images loaded, 4:3 aspect ratios, no page/card horizontal overflow; tabs, selector and three-column price summary fit within the nested padding.
- View Ingredients reveals the full original ingredient text and collapses again.
- Optional Onsen Egg stays within Wednesday's card. Selecting it changes RM62 to RM63.50 and sends the original group/option IDs with service date 2026-10-28 in the weekly add payload. Clearing restores RM62.
- Order by Day retains the selected exchange: Wednesday RM12.90 + RM1.50 = RM14.40; Add emits only mode=day/date=2026-10-28 and that day's unchanged selection IDs.
- Week selector shows original RM67.50, discount RM7.50, final RM60 for the other exact snapshot; switching back restores original RM68.50, discount RM6.50, final RM62.
- Existing source image URLs were used directly and not regenerated or replaced. Screenshots are fixture evidence, not newly published menus.

## Automated validation

Node 22: TypeScript lint passed; Store/model tests 406/406; Functions 512/512; Rules/order-history emulator tests 59/59; Beta deployment safety 53/53; Beta capabilities 11/11 (1,041 total, zero failures). Protected capability contract passed. The old test asserting a fixed h-40 image class was updated for cover sizing; source photo/text and ordering assertions remain. Added regression coverage for full ingredient text, required choices disclosure and the disabled add action until required choices are complete.

Clean protected Beta build and exact-SHA protected CI release are recorded in the PR/release handoff. Production is not authorized for this UI change.
