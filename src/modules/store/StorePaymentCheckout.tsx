import { getPaymentProviderClientAdapter } from './paymentProviders';
import type { PaymentProviderCheckoutProps } from './paymentProviders/types';

export default function StorePaymentCheckout({
  session,
  customerName,
  phone,
  currency,
  total,
  returnUrl,
  onComplete,
  onBack
}: PaymentProviderCheckoutProps) {
  const adapter = getPaymentProviderClientAdapter(session.provider);

  if (!adapter) return (
    <p role="alert" className="rounded-2xl bg-error/10 p-3 font-sans text-xs font-bold text-error">
      This payment option is temporarily unavailable. Please choose another payment method.
    </p>
  );

  const ProviderCheckout = adapter.Checkout;
  return (
    <ProviderCheckout
      session={session}
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
