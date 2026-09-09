import { getPaymentProviderClientAdapter } from './paymentProviders';
import type { PaymentProviderCheckoutProps } from './paymentProviders/types';

export default function StorePaymentCheckout({
  session,
  customerName,
  phone,
  currency,
  total,
  storeSlug,
  storeName,
  storeWhatsApp,
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
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-surface-container-low p-4">
        <div>
          <dt className="font-sans text-[10px] font-extrabold uppercase tracking-wider text-secondary">Order Number</dt>
          <dd className="mt-1 font-sans text-sm font-extrabold text-primary">{session.orderNumber}</dd>
        </div>
        <div>
          <dt className="font-sans text-[10px] font-extrabold uppercase tracking-wider text-secondary">Pickup Code</dt>
          <dd className="mt-1 font-display text-2xl font-bold tracking-[0.16em] text-primary">{session.pickupCode}</dd>
        </div>
      </dl>
      <ProviderCheckout
        session={session}
        customerName={customerName}
        phone={phone}
        currency={currency}
        total={total}
        storeSlug={storeSlug}
        storeName={storeName}
        storeWhatsApp={storeWhatsApp}
        returnUrl={returnUrl}
        onComplete={onComplete}
        onBack={onBack}
      />
    </div>
  );
}
