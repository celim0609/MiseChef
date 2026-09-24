# Beta mixed-release incident: 2026-09-24

This document describes the one-time protected recovery of the mixed Beta release. It is not an application feature release.

## Consumption marker

The recovery controller reads the immutable marker at:

`gs://misechef-beta-fa4bf.firebasestorage.app/misechef-release-guards/beta-mixed-release-2026-09-24.json`

It refuses to run if the object exists. Before deploy, the controller proves the CI service account can write and delete `misechef-release-guards/probe-<nonce>`; a probe failure is a retryable precondition failure and does not consume the incident. After the `firebase deploy` child process emits its `spawn` event, the controller writes this object with `gcloud storage cp --if-generation-match=0`. This atomic create records the GitHub run ID and candidate SHA. A deployment failure after process start remains consumed and requires a new incident controller. If that post-start marker write fails, the controller terminates with `MARKER WRITE FAILED - DO NOT RE-DISPATCH`.

The authorization value is never compared as plaintext. The controller hashes the GitHub environment secret with SHA-256 and compares it to its committed expected digest.

## Candidate delta: `28c564bb..41b331b`

| Area | Files that go live | Notes |
|---|---|---|
| Hosting / public app | `.env.beta`, `.firebase/hosting.ZGlzdA.cache`, `.gitignore`, `src/App.tsx`, `src/components/LoginTab.tsx`, `src/modules/public/HomepageCarousels.tsx`, `src/modules/public/PublicAccountMenu.tsx`, `src/modules/public/PublicLayout.tsx`, `src/modules/public/hostReturnNavigation.ts`, `src/modules/store/PublicStorePage.tsx`, `src/modules/store/services/storeService.ts` | Candidate browser application. The deleted `.env.beta` and Hosting cache are not deployed source. |
| Functions | None | No `functions/**` source changes in this range; Functions are still deployed with the canonical full plan to converge the generated public Store shell. |
| Firestore rules / indexes | `firestore.rules`, `tests/storePaymentAccessControl.test.mjs` | Rules change and authorization coverage; no index file change. `firestore.rules` is identical to `41b331b` (including its merged `89f1200` tightening) apart from any checkout whitespace normalization. |
| Storage rules | None | `storage.rules` is unchanged but deployed with the full plan. |
| Other / release controls | `scripts/deployBeta.mjs`, `src/modules/public/PublicAccountMenu.test.tsx`, `src/modules/public/entryAuthRouting.test.ts`, `src/modules/store/groupOrderPhase1.test.ts` | Release diagnostics and regression coverage; no product feature operation is introduced by this recovery controller. |

The full file-level source of this table is `git diff --stat 28c564bb86f2428d9e23f763b0e81cffda39c381..41b331b95e5354e14bf28a70c4f28e1578ab8d32`.

## Beta alias evidence

`.firebaserc` pins `projects.beta` to `misechef-beta-fa4bf` and `projects.production` to `misechef-fa4bf`. The controller rechecks this before deployment, so `firebase deploy --project beta` cannot target Production through the alias.

## Merge requirement

Merge this recovery PR using **Create a merge commit**. The protected controller checkout is pinned by SHA, and the merge commit keeps that reviewed controller SHA reachable from `main` for the one-time recovery audit.
