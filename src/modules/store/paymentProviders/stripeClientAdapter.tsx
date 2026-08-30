import StripePaymentForm from '../StripePaymentForm';
import type {
  PaymentProviderCheckoutProps,
  PaymentProviderClientAdapter
} from './types';

function StripeCheckout({
  session,
  customerName,
  phone,
  currency,
  total,
  returnUrl,
  onComplete,
  onBack
}: PaymentProviderCheckoutProps) {
  if (session.checkout.type === 'provider_redirect') {
    return (
      <div className="space-y-3">
        <p className="font-sans text-sm font-bold text-on-surface-variant">
          Continue to the secure payment page to choose an eligible payment method.
        </p>
        <a
          href={session.checkout.redirectUrl}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary"
        >
          Continue to Secure Payment
        </a>
        <button type="button" onClick={onBack} className="w-full font-sans text-xs font-extrabold text-primary">
          Back to checkout
        </button>
      </div>
    );
  }
  if (session.checkout.type !== 'stripe_payment_element') {
    return (
      <p role="alert" className="rounded-2xl bg-error/10 p-3 font-sans text-xs font-bold text-error">
        This payment option is temporarily unavailable. Please choose another payment method.
      </p>
    );
  }

  return (
    <StripePaymentForm
      clientSecret={session.checkout.clientSecret}
      paymentSessionId={session.paymentSessionId}
      customerName={customerName}
      phone={phone}
      currency={currency}
      total={total}
      returnUrl={returnUrl}
      onComplete={onComplete}
      onBack={onBack}
    />
  );
}

export const stripeClientPaymentAdapter: PaymentProviderClientAdapter = {
  provider: 'stripe',
  Checkout: StripeCheckout
};
