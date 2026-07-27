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
