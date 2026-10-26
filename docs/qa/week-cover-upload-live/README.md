# Live Beta verification — 25 October 2026

Deployed application SHA: f006237f65c60d6a7d18a5970f3bfc53557db6b0.
Successful protected Beta Release: https://github.com/celim0609/MiseChef/actions/runs/40183769832
PR: https://github.com/celim0609/MiseChef/pull/175

The old control remained live after the earlier Functions deployment failure. User-authorized pinned recovery PR #176 restored coherent assets. Recovery run 40183001127 failed its conservative final renderer-revision assertion because Firebase skipped an unchanged renderer; the subsequent normal protected release above passed. No baseline or normal guard was relaxed.

Live desktop 1440px and mobile 375px tests passed upload, pending preview, save, replacement and persistence after refresh for Weeks 1–3. All 12 stored image versions match selected source PNG bytes exactly. All six persisted controls have zero visible native inputs, no duplicated No file chosen text, and loaded 240×160 images. Mobile controls fit the viewport. Empty-cover Upload Image controls also passed for all three weeks in an unsaved draft, then discarded.

Selection shows a Blob preview and pending filename without success feedback. Successful upload plus product save shows ✓ Image Updated. A failed save showed an error without success (the synthetic fixture initially had an invalid slug; correcting only that fixture resolved it). Earlier component tests cover upload error/retry and oversized-file rejection.

Only unavailable synthetic Beta product qa-cover-20261025-5e93796d was saved, and it is retained for review. Real Beta and Production menu documents match their before snapshots. Production remains 5965b3db695a84efdff3ea1c25305f5736a36127. No real menu, recipe, price, discount, order, payment, product URL or Lalamove behavior changed. No QA data went to Production. The user's original editor tab and unsaved selection were untouched. Extension file URL access stayed disabled.

The four original/replacement JSON files record stored-byte checks; live-control-verification.json records six loaded controls; real-data-preservation.json records preservation. Focused desktop-week1-persisted.jpg through week3 and mobile-week1-persisted.jpg through week3 show live saved controls.
