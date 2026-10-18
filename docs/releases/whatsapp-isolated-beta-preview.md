# Isolated WhatsApp Beta validation

The user authorized a WhatsApp-only Production release and an isolated protected Beta validation path on 19 October 2026. Production live source is `969485e8120a7be680b675e93b6554c886d51ce4`; main Beta contains Healthy Lunch changes absent from Production, so promoting the whole Beta line is outside the approved scope.

`Protected WhatsApp Beta Preview` is a manually dispatched controller on main using the existing `beta` environment reviewer gate. Its exact candidate SHA must match `MISECHEF_WHATSAPP_PREVIEW_APPROVED_SHA` in that environment, and its baseline must match both `MISECHEF_WHATSAPP_PRODUCTION_BASELINE` and the live Production fingerprint. It permits only the three WhatsApp source/test paths and the already-approved delivery fixture clock test file; all payment/delivery implementations and all other paths are rejected.

The controller runs the immutable baseline/regression gate and Store Sets rules suite, then builds the exact candidate for Beta. After credential acquisition, the pinned Firebase CLI uploads only a one-day static Hosting preview channel. It cannot replace the live channel, deploy Functions/rules, or alter Production. The existing Beta APIs supply test order data. This new isolated preview path is the user's explicitly authorized exception to the normal full-resource Beta release; normal Beta and Production workflows are unchanged.

The preview manifest/artifact binds source SHA/tree, Production baseline, live Beta fingerprint, deployed entry asset hash, and preview URL. The main Beta fingerprint must remain unchanged. Live single-/multi-day pickup and delivery confirmation UI QA and an unpaid-order check are required on the preview before updating Production approved SHA and dispatching the existing protected Production Release. The production environment review remains mandatory.

No customer messages are sent during validation. Use only disposable Beta QA order documents and remove them afterward. Do not copy customer phone/address or payment-provider identifiers into fixtures.
