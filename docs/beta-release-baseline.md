# Beta release baseline

The minimum integrated MiseChef Beta release is:

`3d0061d4bb15ae601f894ca99adf5c7536a7beb4`

All future Beta deploy candidates must be based on the latest integrated Beta release, with feature work applied on top. Run:

```sh
npm run validate:beta-baseline
```

The guard verifies that the candidate descends from the recorded release commit, targets `misechef-beta-fa4bf`, and still contains the protected Finance, Costing/Invoices, Recipe Library, Store, Host Group Order, Team, and Owner navigation integration points.

After an integrated Beta deployment succeeds, update `config/beta-release-baseline.json` to the deployed commit. Do not update it merely to make a stale branch pass.

Destructive costing QA must use disposable QA Ingredients and invoices. Never change an existing business Ingredient's price, pack, supplier, or costing data for test convenience.
