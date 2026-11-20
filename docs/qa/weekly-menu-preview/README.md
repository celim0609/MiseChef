# Weekly Menu WhatsApp preview — revised isolated candidate

Status: local review only. No push, deployment, approved-SHA update, Firestore write, Storage upload, order, payment or WhatsApp message has been performed.

## Baseline and root cause

Live Production remains `f5f054c6c06e0ef7039598d88dc1fa9c7cebe77b`, verified through the public release manifest on 20 November 2026. Week 4 currently exposes an original PNG of 2,355,926 bytes in server-rendered `og:image`. Weekly cover selection bypasses the normal product social-image optimization. [WhatsApp's official documentation](https://developers.facebook.com/docs/whatsapp/link-previews/) calls for images below 600 KB. All four original covers are publicly readable without authentication, and the existing week mappings are correct.

The earlier runtime implementation and additional Function resources have been removed. The protected entrypoint, dependency files, scope test, all existing tests, rules, workflows and deployment guards are unchanged.

`functions/index.js` SHA256: `31e48f4a3e3d5d3ee65eccd5274dcc403dea127e9b5551f6a03b8e9eb047796a` — identical to current Production and the immutable scope guard.

## Revised implementation

Four JPEG derivatives are prepared offline and committed as ordinary Hosting assets under `public/assets/weekly-menu-preview/`. The metadata builder matches the exact product route, requested week, Firebase bucket and original Storage object path against a small manifest, then uses the corresponding absolute static asset URL for Open Graph and Twitter. Content hashes in filenames provide a new image cache identity. Metadata also declares actual JPEG type and dimensions.

The existing HTML handler and Hosting rewrites remain unchanged. Image GET/HEAD requests use Hosting rather than a Function image endpoint. No runtime network download, image decoding, resizing, native dependency, additional memory or concurrency change is needed.

Original uploaded objects and source documents are untouched. Derivatives preserve full composition and aspect ratio: no cropping, padding, collage, artistic edit or upscaling. JPEG recompression and proportional downscaling are lossy and are not represented as byte-identical copies. All four derivatives were visually inspected. PSNR against proportionally resized originals was 43.42 / 37.09 / 38.25 / 38.31 dB for Weeks 1–4.

Only full-week covers for the affected product are substituted. Daily meal shares, other products, products without a week query and existing fallbacks retain their prior behavior. A different cover object path is never assigned the old static image. The product route, canonical week selection, title, description, MYR 60.00 price and all underlying commerce data remain unchanged.

## Image results

| Week | Original bytes | Optimized bytes | Optimized dimensions |
| --- | ---: | ---: | --- |
| week1 | 174,340 | 180,785 | 960 × 1200 |
| week2 | 417,593 | 159,188 | 960 × 951 |
| week3 | 503,502 | 197,602 | 960 × 1278 |
| week4 | 2,355,926 | 173,809 | 960 × 1280 |

All files are below the conservative 280 KiB budget, at least 300px wide, and within WhatsApp's 4:1 maximum width/height ratio. The generator verifies SHA256 fingerprints of local originals before writing any derivatives; it never fetches or uploads content. Reproduce with `node scripts/prepareWeeklyPreviewImages.mjs --source-dir /path/to/originals`. Source filenames and both original/output hashes are recorded in the manifest. Public download tokens are not committed.

## Existing Function memory assessment

Current Production is 256 MiB with concurrency 80. A single 20-megapixel RGBA decoded image alone can occupy about 80 MB, excluding input buffers, transformation copies, native encoder work, baseline application memory and concurrent HTML requests. A successful single-image local render would not establish safe memory use under those settings. No load-test claim is made for runtime resizing. Pre-generation removes that uncertain workload entirely; runtime work is a four-entry manifest lookup and normal HTML string generation.

## Validation

- Node 22.23.5, Java 21, pinned Firebase CLI 14.22.0.
- Functions suite: 633/633 passed, including `isolatedPosScope.test.js` unchanged.
- Production deployment safety controller: 24/24 passed.
- Final added-image and protected-scope tests after aspect-ratio assertion: 11/11 passed.
- Full immutable trusted regression runner from `9c2173b9f9ae42b1fc09826c57cef46697759452`: passed with zero failures/skips: capability contract, TypeScript, 864 frontend/model tests, 633 Functions tests, and all five immutable Rules suites (134 tests).
- Additional current candidate/Production Rules suites passed: Store Sets 5/5, Homepage Promotions 3/3, Business Entitlements 4/4. Combined Rules total: 146 tests across eight suites.
- Total distinct automated tests: 1,667 (864 frontend/model + 633 Functions + 146 Rules + 24 Production controller safety); all passed, no skips. The final 11-test image/scope rerun is additional confirmation and is not double-counted.
- Production build and generated HTML shell preparation passed with existing Production browser configuration; built output contains all four static assets.
- Sixteen anonymous HTTP requests against built output through Vite preview passed: GET and HEAD for every image with WhatsApp and Facebook crawler user agents. Status 200, JPEG type and exact output hashes were checked.
- The four original covers were freshly downloaded without auth; their byte hashes match the prior investigation. No original was changed.
- `git diff --check` passed. Generated build-only shell changes are removed from the final candidate.

## Final changed-file list

- `functions/storeSocialPreview.js` — metadata substitution and image declarations only (8 inserted lines, 1 removed).
- `functions/weeklyPreviewImages.js` — bounded static manifest lookup.
- `functions/weeklyPreviewImages.json` — four source/object-to-asset mappings and fingerprints.
- `functions/weeklyPreviewImages.test.js` — new regression tests.
- `scripts/prepareWeeklyPreviewImages.mjs` — offline local generator.
- `public/assets/weekly-menu-preview/week1-2e0dc9ad6245bd7a1f77.jpg`
- `public/assets/weekly-menu-preview/week2-33ab71cb2e1cc95e9cda.jpg`
- `public/assets/weekly-menu-preview/week3-d4ec4cb2837c1f311d84.jpg`
- `public/assets/weekly-menu-preview/week4-241734fa68af69823c02.jpg`
- `docs/qa/weekly-menu-preview/README.md` — this report.

No changes to `functions/index.js`, `functions/entry.js`, Function or root dependency manifests/locks, existing guards/tests, Firebase configuration, rules, frontend code, payment/order/checkout implementation or rotation logic. The superseded runtime image module/test and padded QA JPEGs have been removed from the candidate.

## Remaining risks and acceptance work

1. Public Production URLs for the new static assets and actual WhatsApp preview cannot be verified without deployment. No deployment is authorized in this revision turn. Local unauthenticated HTTP is not a claim of live Production accessibility or a Meta-network crawl.
2. This is an intentionally minimal fix for the four current cover objects. New cover uploads require regenerating the corresponding static assets and manifest. An unrecognized object falls back to its original URL, preserving the correct cover but potentially reintroducing oversized-image previews. Replacing bytes at the same Storage object path also requires explicit regeneration; this implementation assumes the existing UUID upload objects remain immutable.
3. WhatsApp may retain a previously cached preview. After a separately approved protected release, test the exact Week 4 URL first, plus all four week URLs; compare a fresh diagnostic query only if necessary. Confirm the thumbnail, title and description in an actual WhatsApp composer without sending a message.
4. The existing Production build emits bundle-size/dynamic-import warnings; no frontend code was changed to address those unrelated warnings.
5. This local candidate is intentionally uncommitted for review, so no new approved/release SHA is claimed. CI deployment approval and release fingerprints remain untouched.
