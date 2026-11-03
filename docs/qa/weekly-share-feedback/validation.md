# Weekly Menu Share button feedback — 24 October 2026

UI candidate: `5ad8fb9`.
PR: https://github.com/celim0609/MiseChef/pull/175
Beta workflow: https://github.com/celim0609/MiseChef/actions/runs/40100274430

Each Full Set and daily Share button owns its feedback state. A successful clipboard write shows `✓ Copied!` on that button, then restores its original label after 2,000ms. Rejected writes show `Copy failed` and permit retry. Pending writes show `Copying…`, set aria-busy and disable that button. A synchronous ref guard also prevents repeated invocation before React renders the disabled state. Timers are cancelled on retry and unmount. Feedback text uses aria-live=polite.

The original weeklyShareUrl and getStoreProductShareData calls remain unchanged. No photo, recipe, price, discount, ordering, availability, payment or dispatch code changed. No menu/order/payment records were created or modified. Production deployment was not authorized for this update and was not dispatched.

## Browser validation

The actual WeeklyMenuShareButton component was rendered in a temporary localhost fixture with all 18 week/day combinations and controllable clipboard failure/pending behavior. The fixture performed normal clipboard writes on success, rendered the URL forwarded to the write after the promise resolved, and made no Firebase calls. Clipboard buffer readback was unavailable through the browser connector; URL checks used the visible callback result, not an assertion about the OS clipboard buffer. The fixture was removed before the final build/commit.

- Desktop 1440px and mobile 375px: all 18 success feedback checks passed at each size (36 cases). The URL forwarded to clipboard matched the unchanged base path and exact week/day query in every case.
- At both sizes, all 18 simulated rejected writes displayed Copy failed (36 cases).
- At both sizes, an unresolved copy disabled its button. An attempted repeat click did not increment the visible invocation counter. Finishing the pending write displayed success, then restored Share Full Set. Observed finish-click-to-reset times were 2,126ms and 2,128ms, including browser/tool overhead; the component timer is exactly 2,000ms after resolution.
- Failure retry succeeded. Independent buttons retained independent status.
- Screenshots include desktop/mobile success, failure and pending states. These are labelled isolated fixture evidence, not saved customer menus.

## Checks

TypeScript and final Beta-mode Vite build passed. All 38 sharing/social metadata regression tests passed, including all 18 original link combinations. The protected Beta workflow runs its full release regression gate before deploying all required resources.

## Deployed Beta verification

Protected Beta release completed successfully for exact SHA `5ad8fb98c9ad16f60124a772477e6c20a55725a4`. The live manifest matches. Both protected regression passes completed with zero failures/skips, and the Store Sets authorization suite passed.

In the deployed, authenticated Beta admin editor, Share Full Set and all five saved daily Share buttons were tested at 1440px desktop and 375px mobile (12 live cases). Every button displayed ✓ Copied! after the real clipboard-write promise resolved and restored its original label after about two seconds. Live results: live-beta-results.json. Screenshots: beta-desktop-full-set.jpg, beta-desktop-Monday.jpg, beta-mobile-full-set.jpg and beta-mobile-Monday.jpg.

Beta's existing menu currently has only Week 1 saved; Weeks 2/3 were covered in the isolated 18-combination fixture without creating any menu data. No product fields were changed or saved; the editor was closed after QA. The complete Beta menu document is identical before/after testing. Production's live SHA remains `5965b3db695a84efdff3ea1c25305f5736a36127`; the feedback update was not deployed there.
