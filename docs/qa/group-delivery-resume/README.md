# Group Delivery Beta resumption audit

The earlier pilot was inspected at e56168b. Work starts from live Beta 7edcf697e41175a075ed11dfa2d63eeb83ee5775, also the deployed POS-only Production SHA. This branch is a local Beta work in progress.

| Area | Prior implementation | Resumption status |
|---|---|---|
| Customer pilot | Bercham radius, eligible meal allowlist, date cutoff, unpaid reservation, progress and share link | Restored, with area carried through requests and links. Bercham retains the original Pakatan Jaya group key. Tambun and Ulu Kinta need confirmed center pins. |
| Private review | Owner/Manager lookup, meal and destination detail, quote fingerprint and one atomic approval | Restored with compact filters and a count-only reservation projection for the list. Addresses load on selection. |
| Storage and rules | groupDeliveryConfigs, deliveryGroups, groupDeliveryReservations, estimates, approvals and groupDeliveryRateLimits | Restored original callable-only rules and indexes, with an area filter index. Existing Beta records require no migration. |
| Payment | Approval records a zero delivery fee and does not create a checkout or confirmed order | Incomplete. A server-authorized handoff to existing checkout and a paid-delivery fallback need implementation and integrity tests. |
| Timing | Configured reservation cutoff and separate quote pickup time | Existing cutoff enforced. Customer delivery window and final pilot timing remain open. |
| Deployment | POS-only candidate excluded pilot UI and business Functions. Beta retained inert Function names and indexes. | Beta guards restored in server exports and UI entry points. No deployment or live activation for this work in progress. |

Group transactions enforce one active reservation per customer per group and use request IDs for idempotency. Expired and cancelled reservations do not count. The original approval does not charge customers or book Lalamove. The POS quotation endpoint, POS Places configuration, Public Store pickup eligibility code and release workflows are unchanged from the released baseline.

Tests run locally on the restored pilot include TypeScript, 824 frontend/model tests, 610 Functions tests and 20 reservation/review/privacy Firestore emulator tests. Live QA and protected deployment remain pending a complete candidate.
