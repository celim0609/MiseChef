# Group Delivery Phase 2: Owner/Manager POS review

Scope: Beta only, built on live Phase 1 `a67cb8d4acb5fa30f96f76615befb1234f75f5d1`. The customer pilot stays disabled during release and QA; only disposable, undiscovered QA Stores may be temporarily enabled.

## POS flow

Owner/Manager opens **POS → Group Delivery / 团购配送**, filters by delivery date, selects a date/area group and reviews active reserved portions, target 10, reservation cutoff, private customer addresses/units/contacts, and meal quantities/options. Existing POS Live, View Orders, Print Tickets and Store checkout remain their independent flows. The tab uses the existing Owner/Manager Store settings permission; every backend operation independently enforces active Business workspace ownership or active Owner/Manager membership.

The reviewer chooses a kitchen pickup time in MYT and requests a multi-stop delivery estimate. The route starts at the **Store delivery configuration's kitchen pickup**, never the pilot area center, then includes each active customer's selected address/unit in the displayed member order. No route optimization, route splitting or delivery booking is performed. One customer reservation produces one stop, including separate unit instructions even when coordinates match. The supported limit is 15 customer stops plus one kitchen pickup; larger groups block approval until a later route-planning phase.

The estimate uses the existing Sandbox Lalamove provider's **quotation endpoint only**, validates service, stop coordinates/count, MYR price and provider expiry, and stores a private immutable estimate. The UI labels Sandbox explicitly; this is an estimate rather than a binding final delivery charge. No manual price override or customer delivery-cost allocation exists. Customers remain RM0 delivery after approval.

## Approval guarantees

- Approval requires an explicit free-delivery confirmation, exact reviewed estimate ID/fee, and at least 10 active eligible lunch portions.
- Server authorization, Store/workspace ownership, configured date, enabled pilot, active reservation set, meal eligibility, radius, kitchen/service configuration, quote validity, price and pickup time are rechecked in a Firestore transaction. The clock is checked again after reads to reject expiry during approval.
- Estimate fingerprints bind the reviewed reservations, quantities, options, contacts/addresses, expiries, configuration and pickup. Joins, cancellations, rejoining, expiries or configuration changes require a fresh estimate. A changed group while obtaining the provider quote is rejected before that estimate is stored.
- Approval creates exactly one immutable `deliveryGroups/<id>/approvals/free-delivery` document and updates that group's status atomically. It records reviewer UID/time, approved portions, reservation expiry, business estimate, RM0 customer fee, route and reviewed customer manifest. Concurrent approvals and retries return the existing approval; they never create another history entry.
- Approved groups reject new joins/cancellations. Reservations retain their original expiry: current active counts may reach zero while the immutable approved manifest/history retains the reviewed quantities. Approval does not hold kitchen inventory, initiate payments, create confirmed Store orders or kitchen tickets, or book Lalamove.
- Public projection reveals only approved status, without actor identity, business cost, approval manifest, contacts or addresses. The customer UI says approved free delivery, awaiting the payment phase, order unconfirmed.
- Direct Firestore access to reservations, estimates and approval histories remains denied, including to Owner/Manager clients. Private review is callable-only. No new public collection or link exposes customer addresses.
- POS review refreshes selected group data every 30 seconds and checks local expiry every second. Backend transaction checks remain authoritative. Owner/Manager must refresh expired or invalidated estimates and explicitly reconfirm.

## Verification before release

All passed:

- Immutable protected regression gate `9c2173b9f9ae42b1fc09826c57cef46697759452`, run using Node 22 and Java 21: 815 frontend/model tests, 578 Functions tests, protected rules suites 29 + 2 + 21 + 8 + 61. No failures/skips.
- Reservation/review/privacy emulator suite: 20 tests. Covers both phases, private address authorization, quote route/cost, explicit confirmation, minimum portions, expiry, quote invalidation after joins/pickup/config changes, role revocation, concurrent approvals, duplicate histories, public approved projection, direct Firestore denial and no Store/payment side effects.
- Store Sets rules: 5 tests. Beta deployment safety: 53 tests.
- TypeScript and Beta-mode Vite build. Existing bundle-size advisory remains.

Relevant commands: `npm run test:group-delivery:integration`, `npm --prefix functions test`, `npm run test:store-payments:model`, `npm run test:store-sets:rules`, `npm run test:beta-deployment-safety`, `npm run lint` and the immutable `runBetaProtectedTests.mjs` gate.

## Protected release and live QA

Use only the existing protected **Beta Release** workflow, its allowed main controller, the exact reviewed candidate SHA and the normal required Beta environment review. Do not merge into main as a deployment shortcut, alter protected baseline/approval rules, use direct Firebase deployment or touch Production. Recheck the live fingerprint before release.

After successful workflow completion, verify the exact live SHA, the new list index, existing Store/cart review, Owner/Manager POS access, authenticated private detail, a genuine multi-stop Sandbox quotation, explicit approval/history and duplicate rejection. Test unauthorized/customer/private Firestore access, quote staleness and RM0 public approved state. Use a separate disposable QA Store excluded from Discover and remove its quote/approval/reservation/config/workspace/product/Auth fixtures afterward. Leave the real customer pilot disabled. Record live results separately without changing the released source SHA.

Lalamove quotation specification: https://developers.lalamove.com/ (2–16 total stops, expiry, service and currency fields).
