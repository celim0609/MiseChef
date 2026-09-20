import { getPaymentProviderClientAdapter } from './paymentProviders';
import type { PaymentProviderCheckoutProps } from './paymentProviders/types';
import PaymentOrderSummary from './PaymentOrderSummary';
import { formatPickupDateLabel, formatPickupTimeLabel } from './storeModel';
import type { PublicStoreData } from './types';

export default function StorePaymentCheckout({
  session,
  customerName,
  phone,
  customerEmail,
  currency,
  total,
  storeSlug,
  storeName,
  storeWhatsApp,
  country,
  returnUrl,
  onComplete,
  onBack
}: PaymentProviderCheckoutProps & { country: PublicStoreData['store']['country'] }) {
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
      {session.orderSummary?.fulfilmentMethod === 'pickup' && session.orderSummary.pickupDetails && (
        <dl aria-label="Pickup Details" className="space-y-1 rounded-2xl bg-surface-container-low p-4 font-sans text-sm font-bold text-primary">
          <dt className="text-xs font-extrabold uppercase tracking-[0.16em] text-secondary">Pickup Details</dt>
          <div><dt className="inline text-on-surface-variant">Location: </dt><dd className="inline">{session.orderSummary.pickupDetails.locationName}</dd></div>
          <div><dt className="inline text-on-surface-variant">Date: </dt><dd className="inline">{formatPickupDateLabel(session.orderSummary.pickupDetails.date, country)}</dd></div>
          <div><dt className="inline text-on-surface-variant">Time: </dt><dd className="inline">{formatPickupTimeLabel(session.orderSummary.pickupDetails.time, country)}</dd></div>
        </dl>
      )}
      {session.orderSummary && <PaymentOrderSummary summary={session.orderSummary} />}
      <ProviderCheckout
        session={session}
        customerName={customerName}
        phone={phone}
        customerEmail={customerEmail}
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
