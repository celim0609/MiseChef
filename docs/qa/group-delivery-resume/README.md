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

## Confirmed pilot policy and checkout audit

Pakatan Jaya remains the only configured pin. Tambun and Ulu Kinta remain closed until their exact pins are supplied. Each enabled area uses an 11:00 AM–1:00 PM MYT delivery window and a 5:00 PM MYT cutoff on the previous calendar day. Ten paid, valid lunch portions qualify for Owner/Manager free-delivery review.

The existing reservation and approval code counts unpaid portions and expires them at cutoff. It cannot establish paid eligibility. The canonical Store checkout revalidates a delivery quote and collects the full order total in one payment. It does not provide a separate delivery-fee payment against an existing paid meal order. Paid eligibility must come from server-verified order payment state, with cancellation/refund invalidation and a unique reservation-to-order binding. Any later paid-delivery choice must obtain a fresh Store quote and require a customer action. Group Delivery does not book drivers, issue refunds, or participate in driver bidding or payouts.


## Local implementation and verification

- The server derives the fixed cutoff from the delivery date. The Store displays the shared MYT window. The original Bercham pin and group ID remain intact.
- Group progress and approval count only paid Store meal orders with a matching server-owned reservation link and a payment-received event before cutoff. Cancelled, deleted and refunded orders are excluded. Paid portions survive reservation expiry. Legacy unpaid approvals do not qualify.
- Below target at cutoff, a paid participant can request a normal Store Lalamove quote based on their reservation or request cancellation. An authorized reviewer records receipt of the external fee against the current unexpired quote and exact amount. Reused receipt references are rejected and identical retries are idempotent. Cancellation requests appear in private POS review. These actions do not charge, refund or book delivery.
- The emulator tests seed paid meal orders to exercise the paid approval, fallback and receipt paths. The live customer meal checkout does not yet create the reservation-to-order binding. It also needs a group fulfilment hold and release path so normal checkout cannot send a paid reservation into kitchen preparation or delivery before the group decision. This remains a release blocker. The branch has not been deployed.
