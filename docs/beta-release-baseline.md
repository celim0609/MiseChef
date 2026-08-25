# Beta release baseline

The minimum integrated MiseChef Beta release is:

`02fff9fd9ac89dfab1ed5b7c8f80f9b365ba796b`

All future Beta deploy candidates must be based on the latest integrated Beta release, with feature work applied on top. Run:

```sh
npm run validate:beta-baseline
```

The guard verifies that the candidate descends from the recorded release commit, targets `misechef-beta-fa4bf`, and still contains the protected Finance, Costing/Invoices, Recipe Library, Recipe Edit Cost Analysis, Store, Host Group Order, Team, and Owner navigation integration points.

Recipe Edit Cost Analysis protection verifies that the shared costing component and calculator still exist, Edit Recipe binds its single canonical Selling Price draft inside Cost Analysis, and the complete editor order remains Yield → Cost Analysis → Ingredients → Instructions → Recommended Products → Video → Story → Chef Notes. It also verifies that Recipe costing reads currency from the active Workspace provider and formatter.

After an integrated Beta deployment succeeds, update `config/beta-release-baseline.json` to the deployed commit. Do not update it merely to make a stale branch pass.

Destructive costing QA must use disposable QA Ingredients and invoices. Never change an existing business Ingredient's price, pack, supplier, or costing data for test convenience.
