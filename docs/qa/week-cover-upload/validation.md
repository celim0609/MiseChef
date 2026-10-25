## Final live result

Earlier pending statements below are historical. Recovery and live upload QA are now complete. See [live results](../week-cover-upload-live/README.md). Production remains unchanged.

# Week Cover Upload polish — 25 October 2026

PR: https://github.com/celim0609/MiseChef/pull/175
UI candidate: f006237
Beta workflow: https://github.com/celim0609/MiseChef/actions/runs/40156447172

## Changes

Week 1–3 use the same styled Upload Image / Replace Image component with a hidden native file input. The current cover stays visible; choosing a file shows an object-URL preview and a pending-save filename. JPEG/PNG/WebP and the existing 10 MB limit are retained. The input resets after selection so the same file can be selected again. Object URLs are released when no longer needed.

The existing uploadHealthyLunchMealPhoto storage helper and product save path are unchanged. A successful cover upload sets a local flag; ✓ Image Updated is shown only after the product save also succeeds. Failed cover uploads show a clear error beside the corresponding week and retain the pending selection for retry. No confirmation is shown merely for selecting a file or for a failed save.

No product URLs, recipe/meal data, prices, discounts, orders, payments or Lalamove logic changed. No image resizing, compression, cropping or conversion was introduced. Existing stored objects are not deleted or overwritten by the UI change; the original uploader continues using unique object paths and the original File bytes.

## Checks completed

TypeScript and Beta-mode Vite build passed. Seven storage/save-feedback regression tests and 38 sharing/social preview tests passed.

An isolated localhost fixture rendered the actual WeekCoverUpload component for all three weeks. At desktop width, selecting the original QA PNG through the native file chooser displayed each preview and Replace Image. Simulated upload failures displayed three per-week errors. Retrying and saving displayed ✓ Image Updated. These fixture saves did not call Firebase or change any real menu.

The Chrome connector's filechooser.setFiles operation is blocked because the extension lacks Allow access to file URLs. The native picker fallback completed initial desktop selection tests, but active Chrome use interrupted subsequent picker interactions. The user later paused Chrome and the native-picker follow-up below completed. Extension/security permissions remained unchanged.

Replacement and mobile component checks subsequently passed in the native-picker follow-up below. Real Beta Storage/Firestore save and original-byte verification remain pending. Production preparation must not treat those checks as passed until completed. Production has not been deployed for this update.

## Beta deployment incident

The protected release passed its regression gates, then failed during Google Cloud Functions deployment with HTTP 500 responses for getPublicStorePaymentResult and saveStoreManualPosOrder. Hosting did not publish. The manifest/root still identify 5ad8fb9 while renderPublicStore references f006237's asset; the asset request currently returns fallback HTML. The standard coherence gate blocks an ordinary retry, which was cancelled before any further deployment.

A pinned, one-shot, full-resource recovery proposal is available for release-owner review: https://github.com/celim0609/MiseChef/pull/176 . Its 58 safety tests and clean-checkout CI-equivalent import preflight passed. Normal release guards, protected baseline and permissions remain unchanged. New recovery authority bindings/secrets have not been set and recovery has not been dispatched. Executing that exceptional path requires owner approval because AGENTS.md restricts normal deployment to the Beta Release workflow.

Both real Beta and Production Weekly Menu documents were compared before/after this work and remain identical. Production SHA remains 5965b3db695a84efdff3ea1c25305f5736a36127. No QA menu/product was created and no real image, price, recipe, order, payment or Lalamove setting was edited. This UI update remains unverified for Production.

## Native-picker follow-up — 25 October 2026

The user chose to keep extension file URL access disabled and pause Chrome. Native-picker tests then completed at desktop 1440px and mobile 375px using the actual WeekCoverUpload component in an isolated fixture. For all three weeks at both widths: initial selection, preview, pending filename, simulated save failure, per-week error, retry, successful fixture save, replacement preview and replacement fixture save passed. Desktop oversized-file rejection preserved the current preview. Mobile showed no visible native inputs or horizontal overflow; all three original/replacement previews retained 240×160 natural dimensions. Results: native-picker-results.json. Screenshots include desktop/mobile saved replacements and per-week errors.

The fixture save uses controlled local state and object URLs; it does not upload to Firebase or commit a real product. Live Beta Storage upload/product-save persistence and stored-byte verification are still pending recovery approval for PR #176. Recovery was not executed based on the browser-pause reply, and Production remains unchanged. No browser extension permissions were changed.
