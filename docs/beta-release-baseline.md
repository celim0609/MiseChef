# MiseChef Beta release safety

The mandatory protected Beta baseline is:

`06a37c0d30c47e037994454119a0461955df4ee3` (Beta Release #16)

The repository copy is documentation, not the sole authority. The protected CI `beta` environment must provide the same value through the `MISECHEF_BETA_PROTECTED_BASELINE` repository/environment variable. A candidate must match that external value and descend from it.

## Supported release procedure

1. Integrate feature work on top of the current protected baseline.
2. Ensure the worktree is clean and the candidate is committed.
3. Run `npm run verify:beta-release` for a non-deploying local verification. Set `MISECHEF_BETA_PROTECTED_BASELINE`, `MISECHEF_BETA_BOOTSTRAP_LIVE_ASSET`, and the documented verify-only Java exception only when Java is unavailable.
4. Trigger the protected GitHub Actions **Beta Release** workflow. This is the only supported deployment path.
5. The workflow serializes releases with the `misechef-beta-deployment` concurrency group, verifies the external baseline and live release, runs protected tests including emulator Rules tests, deletes and rebuilds `dist`, writes a commit-bound build manifest, verifies the Store SSR shell asset, and deploys Functions, Hosting, Firestore Rules/indexes, and Storage Rules together.
6. Perform live regression QA from a fresh session.
7. Only after explicit release completion may a release owner advance the external CI baseline and commit the matching repository baseline update.

Direct `firebase deploy`, resource-only deployment, deployment from dirty source, and deployment without the canonical session are unsupported and fail on the protected lineage.

## External authority and locking

GitHub environment/repository configuration must define:

- `MISECHEF_BETA_PROTECTED_BASELINE=06a37c0d30c47e037994454119a0461955df4ee3`
- `MISECHEF_BETA_BOOTSTRAP_LIVE_ASSET=/assets/index-CxlZYCEu.js` until the first hardened release publishes live release metadata
- `FIREBASE_SERVICE_ACCOUNT_MISECHEF_BETA` with credentials restricted to the Beta project

The Firebase deployment credential must be available only to the protected Beta workflow. Otherwise an old branch containing an old `firebase.json` can still bypass branch-local hooks. The repository cannot technically prevent that without platform-level credential restriction.

The CI concurrency group is authoritative for supported releases. An emergency local release is disabled by default and has only a machine-local Git common-directory lock; it is not a cross-machine substitute for CI locking.

## Protected integrations

Release validation and mandatory regression tests cover Recipe Creator Attribution, Recipe Cost Analysis and canonical Selling Price placement, active Workspace MYR/SGD currency, Recipe Share and its public projection, Quick Add, Finance, Supplier Invoice/OCR, Store, Host Group Order, Team, Recipe Library and public Discover, and Owner navigation.

The generated `functions/generated/publicStoreAppShell.html` is the only documented post-build dirty-source exception. It is derived from `dist/index.html`, verified against the exact Hosting asset, packaged with `renderPublicStore`, and restored locally after the release command finishes.

## One-time Release #28 partial-deployment recovery

The standard Beta Release path continues to require a coherent live Hosting and public Store shell. The only supported exception is the incident-specific recovery for failed Beta Release run `33189217434`, candidate `3443de1b21042573aeffb7f23171abd2a23eff24`.

Recovery requires both the exact workflow confirmation `RECOVER BETA RELEASE 28` and this protected GitHub `beta` environment variable:

`MISECHEF_BETA_RELEASE_28_RECOVERY_AUTHORIZATION=release-28-partial:33189217434:3443de1b21042573aeffb7f23171abd2a23eff24`

The protected environment must also set `MISECHEF_BETA_RELEASE_28_RECOVERY_GATE_SHA` to the exact reviewed commit that introduces the recovery controller. The dedicated workflow checks out the controller from that external SHA and separately checks out candidate `3443de1b21042573aeffb7f23171abd2a23eff24`; the controller changes are therefore never represented as candidate application or Functions code.

Candidate source has no fallback authorization. The recovery additionally verifies the failed GitHub run, the prior manifest lineage, the exact live Hosting/Store assets, all 37 Function generations and hashes, candidate artifact reproduction, and post-deploy convergence. Once those resources converge, the recorded incident fingerprint no longer matches and the recovery cannot be reused.
