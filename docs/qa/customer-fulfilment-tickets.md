# Customer fulfilment tickets

Priority 1 was implemented and verified with six focused tests, the existing 355 Store model tests and TypeScript before the kitchen/daily-status implementation.

Final local verification: 360 Store model tests, 439 Functions tests, Store payment and order history Firestore/Storage emulator tests, TypeScript and Vite build. Headless Chrome printed a synthetic nine-ticket batch to two A4 pages; visual inspection confirmed the first page has two columns and four rows, readable snapshot content and cut guides. The output contains no prices.

## Beta acceptance

- Open Store Orders and POS with disposable single-day pickup, delivery, multi-day and legacy weekly orders.
- Select individual fulfilments dated today; print Customer Tickets and Kitchen Tickets. Confirm only allocated meals/options for the selected date appear, correct store name (GG Grab&Go), customer, order number, pickup code and date/time.
- Print nine selections and inspect two A4 sheets at 100% scale. Reprint twice and verify no order/payment/stock/delivery writes.
- Move one scheduled pickup through Preparing, Ready and Completed. Check sibling days and parent payment remain unchanged; parent completes only after all fulfilments complete.
- Confirm paid cancelled orders appear only in History, future days appear in Upcoming, and today's completed days remain in History.
- Confirm existing Walk-in receipt printing, group kitchen actions, WhatsApp and delivery dispatch remain available. Delivery completion continues to require provider confirmation.
- Use protected Beta Release for the exact candidate SHA. Production Release must use the Beta-tested SHA and protected Production environment approvals.

Oversized tickets are reduced to a minimum 7px font. If content still exceeds the fixed cell, printing is blocked with a message rather than losing content. Store Orders history uses existing pagination; load more history to locate older fulfilments for reprint.
