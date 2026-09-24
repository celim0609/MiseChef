# Beta mixed-release incident: 2026-09-24

This document describes the one-time protected recovery of the mixed Beta release. It is not an application feature release.

## Consumption marker

The recovery controller reads the immutable marker at:

`gs://misechef-beta-fa4bf.firebasestorage.app/misechef-release-guards/beta-mixed-release-2026-09-24.json`

It refuses to run if the object exists. After the `firebase deploy` child process emits its `spawn` event, the controller writes this object with `gcloud storage cp --if-generation-match=0`. This atomic create records the GitHub run ID and candidate SHA. Any precondition failure occurs before that point and leaves the incident retryable. A deployment failure after process start remains consumed and requires a new incident controller.

## Candidate delta: `28c564bb..1c6b868`

| Area | Files that go live | Notes |
|---|---|---|
| Hosting / public app | `.env.beta`, `.firebase/hosting.ZGlzdA.cache`, `.gitignore`, `src/App.tsx`, `src/components/LoginTab.tsx`, `src/modules/public/*`, `src/modules/store/PublicStorePage.tsx`, `src/modules/store/services/storeService.ts` | Candidate browser application and generated Hosting inputs. |
| Functions | None | No `functions/**` source changes in this range; Functions are still deployed with the canonical full plan to converge the generated public Store shell. |
| Firestore rules / indexes | `firestore.rules` | Rules change; no index file change. |
| Storage rules | None | `storage.rules` is unchanged but deployed with the full plan. |
| Other / release controls | `scripts/deployBeta.mjs`, tests | Release diagnostics and tests; no product feature operation is introduced by this recovery controller. |

The full file-level source of this table is `git diff --stat 28c564bb86f2428d9e23f763b0e81cffda39c381..1c6b8680bb139ff0c011375ce8ff79d42aea0f99`.

## Beta alias evidence

`.firebaserc` pins `projects.beta` to `misechef-beta-fa4bf` and `projects.production` to `misechef-fa4bf`. The controller rechecks this before deployment, so `firebase deploy --project beta` cannot target Production through the alias.
