# Ticket-only Production candidate Beta validation

Production is on `a40c5eeebd88e8211e80a407d59317ce4f0b127e`; full Beta contains unrelated meal-option, delivery and pricing changes. The ticket-only Production descendant is `a907e95` and changes only ticket printing, day status handling, Orders/POS and their tests/QA documentation. Curlec, Lalamove, pricing and the completed WhatsApp code remain identical to Production.

The protected Ticket Beta Preview controller is based on the existing isolated preview design. It requires main workflow dispatch, Beta environment review, an exact environment-approved candidate SHA, an external Production baseline matching the live Production manifest, a restricted ticket-only path allowlist and identical day-status backend source to the deployed main Beta. It runs the immutable candidate gate, Store Sets authorization tests and a Beta build. It uploads only a one-day static Hosting preview; main Beta, Functions/rules and Production cannot be deployed by this workflow. Main Beta fingerprint must remain unchanged.

Environment authorities: `MISECHEF_TICKET_PREVIEW_APPROVED_SHA`, `MISECHEF_TICKET_PRODUCTION_BASELINE`. The existing protected Production Release workflow and its approval controls are unchanged. Native Chrome print QA on the exact preview candidate must pass before Production approved SHA advances.
