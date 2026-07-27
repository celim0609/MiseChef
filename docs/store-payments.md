# Store payments

## Phase 1: one merchant

MiseChef uses Stripe PaymentIntents and the Stripe Payment Element for Ce Lim
Kitchen. Stripe settles funds directly to the Stripe account identified by
`STRIPE_SECRET_KEY`; MiseChef does not split or route funds.

Only the workspace whose ID matches `SELLING_WORKSPACE_ID` can create a payment
session. This is checked in the trusted Function after the Store is resolved
from its public slug. It is intentionally not based on a Store name.

The browser sends only customer, pickup, and product-selection input. The
Function:

1. loads the current Store, products, and option groups;
2. validates preorder availability and pickup details;
3. rebuilds item snapshots and prices on the server;
4. creates an `Awaiting Payment` order;
5. asks the configured payment-provider adapter to create an idempotent payment;
   and
6. returns a provider-neutral session containing its provider ID, checkout
   presentation, public order number, and a separate random checkout access
   token.

Firestore clients cannot create or update `storeOrders`. Payment completion is
reconciled from a signed provider webhook or a server-side provider lookup. The
redirect alone never marks an order paid. Customer-facing result and
cancellation calls require the provider ID, payment session ID, and checkout
access token; only a SHA-256 hash of that token is stored.

## Stable payment contract

Orders use MiseChef statuses (`pending`, `processing`, `paid`, `failed`, and
`cancelled`) plus a provider-neutral payment envelope:

- `provider`
- `providerMode`
- `providerPaymentId`
- `providerPaymentMethod`
- `amountMinor`
- `currency`
- `refundStatus`
- `refundedAmountMinor`

The public Store, cart, QR code, pickup, and order flows only know
`StorePaymentSession` and `storePaymentService`. They never create or interpret
a Stripe PaymentIntent.

Provider responsibilities are separated:

- `functions/paymentProviders/index.js` selects the active provider.
- Each server adapter creates, retrieves, cancels, verifies webhooks, and
  normalizes provider status into MiseChef payment state.
- `StorePaymentCheckout.tsx` resolves a client payment adapter without knowing
  which providers exist.
- `src/modules/store/paymentProviders/index.ts` is the client adapter registry.
- Stripe-specific Payment Element code lives only in
  `StripePaymentForm.tsx`.

Phase 1 selects Stripe as the primary provider. Stripe can present Cards, FPX,
or PayNow when the merchant account, Store country, currency, and Stripe
configuration make them eligible. The order request never selects a provider
or supplies merchant routing.

## Future native Touch 'n Go provider

Native Touch 'n Go eWallet can be added later through a second Malaysian
provider without changing the Store or ordering flow:

1. add a provider adapter that returns the same normalized payment contract;
2. register it in `functions/paymentProviders/index.js`;
3. add its client checkout adapter and register it in
   `src/modules/store/paymentProviders/index.ts`; and
4. select it from trusted workspace/region payment configuration.

The provider may use an embedded or redirect checkout, but customers still
follow the same QR/link → Store → cart → pickup → details → payment →
confirmation journey.

Adding a provider must not require changes to Public Store, cart, QR ordering,
checkout flow, order model, or pickup flow. Boundary tests enforce that these
modules do not import provider SDKs or provider-specific payment state.

## Phase 2: Stripe Connect

Do not enable Connect in Phase 1. When independent Store Owners start selling:

1. add a Connect adapter implementing the same create/retrieve/webhook contract;
2. change `providerMode` from `single_merchant` to `connect`;
3. resolve the destination connected account from trusted workspace payment
   configuration; and
4. keep the existing QR, public Store, cart, pickup, Payment Element, and
   confirmation experience.

No customer-facing order input will contain a destination account ID.

## Configuration before any release

Browser build:

- `VITE_STRIPE_PUBLISHABLE_KEY` — matching publishable key for the merchant
  Stripe account.

Firebase Functions:

- `SELLING_WORKSPACE_ID` — Ce Lim Kitchen's exact Firestore workspace ID.
- `STRIPE_SECRET_KEY` — matching Stripe secret key in Firebase Secret Manager.
- `STRIPE_WEBHOOK_SECRET` — signing secret for
  `stripeStorePaymentWebhook`.

Stripe Dashboard:

- activate only payment methods supported by the merchant's Stripe account and
  desired currencies;
- register the deployed `stripeStorePaymentWebhook` URL; and
- subscribe to `payment_intent.succeeded`, `payment_intent.processing`,
  `payment_intent.payment_failed`, `payment_intent.canceled`,
  `charge.refunded`, `refund.created`, `refund.updated`, and `refund.failed`.

For local emulator testing, use Stripe test-mode keys and a Stripe CLI webhook
forwarder. Never put a secret key in a `VITE_` variable or commit local secret
files.
