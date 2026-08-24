# MiseChef Beta release safety

- Treat commit `3d0061d4bb15ae601f894ca99adf5c7536a7beb4` as the minimum integrated Beta baseline.
- Start future Beta work from the latest integrated Beta release HEAD. A final deploy candidate must be descended from the recorded baseline and include the new feature on top.
- Never deploy Hosting from a stale or divergent feature branch/worktree.
- Before every Beta deployment, run `npm run validate:beta-baseline` and compare the candidate with the currently recorded Beta release.
- Preserve Finance, Costing/Supplier Invoices, Recipe Library, Store, Host Group Order, Team, and Owner navigation unless the task explicitly changes them.
- After each successful integrated Beta release, update `config/beta-release-baseline.json` to the deployed commit in a follow-up source-control commit.
- Use only disposable QA Ingredients and invoices for destructive import/costing tests. Remove them after QA. Never alter real Ingredient price, pack, supplier, or costing data merely to prove a test.
- Production project `misechef-fa4bf` is out of scope unless the user explicitly authorizes it.
