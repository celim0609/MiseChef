# Independent Weekly Menu discounts (Beta)

Each dated or rotation week stores `discount: { type, value }`. Types are `none`, `percentage`, `fixed_amount`, and `fixed_weekly_price`; monetary values use Store currency units. Original weekly price is the sum of the five rounded daily prices. Percentage savings round once, to the nearest minor unit. Optional meal surcharges are added after weekly discount calculation. Fixed discounts/prices cannot exceed the five-day total. A zero merchandise price is valid, but checkout still requires a positive payable total.

Only the validated complete Monday–Friday Full Set uses weekly pricing. The server selects pricing from the actual fulfilment Monday. Daily lines keep daily prices and remain eligible for separately configured promotions. Explicit weekly discounts do not stack with product promotions. `none` may use an explicitly configured product promotion. Historical package prices and their existing promotions retain their prior behavior.

Migration is lazy and non-destructive: unconfigured weeks retain the historical Product price; saving the menu freezes it into each week's `legacyWeeklyPrice`. Setting a discount on one week does not change the others. New weeks default to `none`. Conversion from dated menus to a rotation retains week configuration. No existing order documents are rewritten.

New orders persist `items[].weeklyPriceSnapshot` containing the original price, discount configuration, discount amount, final weekly base price, legacy marker, and schema version. Existing unit/line totals include options and quantities, and the promotion snapshot retains separately applied historical promotions. Saved order normalization clones the snapshot without recalculating from the catalogue. Existing orders without it remain readable.

Validation:
- `npm run lint`
- `npm run test:store-payments:model`
- `npm --prefix functions test`
- `npm run test:store-payments:rules`
- Beta build and protected CI full-resource Beta Release workflow.

Production deployment requires explicit user approval. The protected baseline and release authority are unchanged.
