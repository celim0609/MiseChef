# POS View Orders customer communication

The order details have Confirm Order, Order Reminder and Delivery Update. The reminder date selector belongs to the selected order. Each action opens WhatsApp Web with a phone and encoded plain-text message; the owner reviews it and presses Send in WhatsApp.

Confirm Order includes all scheduled dates and allocations, or the independent weekly fulfilment meals. Only a paid order says payment confirmed. Reminders use exactly the selected service date. Delivery Update uses today's Malaysia date and the date-specific operation status and shareLink; it never borrows another date's parent tracking link. When a status is absent it explicitly says Status unavailable. Pickup orders show pickup status. Dates without today's items disable Delivery Update.

Opening a reminder calls the authenticated recordStoreCustomerReminder callable with draft_opened. A separate checkbox explicitly acknowledges sending in WhatsApp and records owner_confirmed_sent. Firestore records are scoped to order and date, include actor/time, and never downgrade confirmed sent records. Opening any action never sends messages. Existing order/payment/delivery transitions are unchanged; only customerReminders metadata can be written by the new callable, under existing Store processing authority and Business entitlement checks.

Validation: TypeScript, Beta-mode Vite build, full Store model suite, full Functions suite. Added tests cover unpaid/paid confirmation, allocations, weekly components, independent weekly schedules, selected-date filtering, today's per-date delivery status/tracking, phone/link encoding, plain-text cleanup, all three UI labels, metadata-only writes, explicit acknowledgement precondition, sent-status preservation, authorization, and invalid dates.

Release through protected Beta Release only. Live Beta QA must check disposable single-day, multi-day and weekly pickup/delivery orders, selected-date reminders, unpaid confirmations, invalid phone, reload persistence, and explicit sent acknowledgement. Do not send a customer message during QA. Production requires separate explicit user approval.

## Entitlement boundary regression correction

Protected Beta run 40840182169 used controller 4f168e196375d9894258b7445ad6af0a28ee37cc and tested candidate 6d67318ad9735f4097bd488964023fac5a6e4736. Frontend test #666 failed because entitlementBoundary.test.ts counted exactly two occurrences of hasActiveBusinessEntitlement(workspace) in storeFulfilment.js. The new recordStoreCustomerReminder endpoint correctly added a third guard, alongside the unchanged single-order and group-order guards. This was an outdated structural test assumption, not removal of an entitlement boundary.

The test now parses the three named handlers and verifies that each has a fail-closed entitlement rejection before its first transaction write. It retains public customer/rules assertions. Additional runtime coverage rejects both reminder states for personal, expired, canceled and expired-trial subscriptions, including workspace owners, with zero writes. No runtime authorization or public-access implementation changed in this correction. The immutable trusted gate and its pinned revision are unchanged.
