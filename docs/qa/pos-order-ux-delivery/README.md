# POS Add Order UX and delivery estimates

This extends the existing external POS order path. It does not create another order or payment system. Existing manual Pending Payment orders and public checkout remain on their existing paths.

Product and Set cards use the cart's quantity directly, show Added feedback, and provide quantity controls. Weekly cards show quantities across selected dates. A synchronous 350ms guard rejects rapid duplicate Add events. The catalog shows the current item count and total.

Customer & Fulfilment contains source, contact details, method, main date/time, address and notes. Ordinary items inherit the main schedule. An explicit line override exposes per-item controls. Weekly Plan and selected meal dates remain canonical.

Address search reuses the Google Places Malaysia autocomplete integration. Address correction preserves the selected pin. Quote requests resolve each Place ID again on the server, validate Malaysia, ignore client-supplied coordinates and preserve corrected address text. Dates can override the main destination.

The authenticated POS quote endpoint reuses Lalamove v3 quotation requests and existing per-day free-delivery/subsidy pricing. It never creates a booking. Quotes are private server snapshots bound to operator, Store, currency, catalog prices, quantities, schedule, destinations and delivery policy. Checkout reads the snapshot transactionally and rejects expired or changed quotes. Provider cost stays separate from the customer delivery fee. Public callers cannot read or write quote documents.

Owner/Manager can explicitly record a bounded manual fee and reason when quoting is unavailable, including historical orders. The server audits their identity and keeps unknown provider cost null. Both automatic estimates and manual fees contribute to the existing order total, paid external amount and canonical totals. Existing external payment labels and fulfilment transitions are unchanged. Quotation and order creation do not book Lalamove.

Validation includes type checking, Store model/component tests, Functions tests, and Firestore/Storage integration tests covering exact saved totals, stale/forged fee rejection, server-resolved pins, schedule/destination changes, multiple quotes, per-day free delivery, historical overrides, role restrictions, idempotency and unchanged payment/fulfilment behavior. The protected full-resource Beta release and live Beta QA are required. Production is explicitly out of scope.
