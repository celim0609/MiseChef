# MiseChef Beta release safety

- Treat commit `06a37c0d30c47e037994454119a0461955df4ee3` (Beta Release #16) as the mandatory protected Beta baseline until the protected CI release authority is advanced after a successful release and live QA.
- Start future Beta work from the latest integrated Beta release HEAD. A final deploy candidate must be descended from the recorded baseline and include the new feature on top.
- Never deploy Hosting from a stale or divergent feature branch/worktree.
- The only supported Beta deployment entry point is the protected CI **Beta Release** workflow, which runs `npm run deploy:beta`. Direct `firebase deploy` commands are unsupported.
- Before every Beta deployment, require the external `MISECHEF_BETA_PROTECTED_BASELINE`, validate ancestry and the live release fingerprint, run all protected tests, rebuild `dist`, and deploy Functions, Hosting, Firestore Rules/indexes, and Storage Rules together.
- Preserve Finance, Costing/Supplier Invoices/OCR, Recipe Library, Recipe creator attribution, Recipe Edit Cost Analysis, active Workspace currency, Recipe Share/public projection, Quick Add, Store, Host Group Order, Team, Discover/public Discover, and Owner navigation unless the task explicitly changes them.
- Treat Recipe creator attribution as a protected integration point: Recipe Library and Recipe Detail must show the original creator display name, and edits must preserve creator and Workspace identity fields.
- Treat Recipe Edit Cost Analysis as a protected integration point: Edit Recipe must keep the shared live Cost Analysis before Ingredients, keep Selling Price bound to the canonical Recipe draft inside Cost Analysis, and keep Story/Chef Notes after the operational Recipe sections.
- Do not change the protected baseline from a feature branch. After deployment, live QA, and explicit release completion, an authorized release owner must advance the external CI authority first and then update repository config/documentation in a follow-up baseline-only commit.
- If the live Beta fingerprint changes after validation begins, stop and integrate the newer deployed line. Never overwrite it blindly.
- Use only disposable QA Ingredients and invoices for destructive import/costing tests. Remove them after QA. Never alter real Ingredient price, pack, supplier, or costing data merely to prove a test.
- Production project `misechef-fa4bf` is out of scope unless the user explicitly authorizes it.
