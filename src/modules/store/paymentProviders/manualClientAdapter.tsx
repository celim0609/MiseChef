import { useState } from 'react';
import { CheckCircle2, Upload } from 'lucide-react';
import { formatRegionCurrency } from '../../../regions';
import { storePaymentService } from '../services';
import type { PaymentProviderCheckoutProps, PaymentProviderClientAdapter } from './types';

function ManualCheckout({ session, currency, total, onComplete, onBack }: PaymentProviderCheckoutProps) {
  const [receipt, setReceipt] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  if (session.checkout.type !== 'manual_payment') return null;
  const checkout = session.checkout;
  const isCash = checkout.methodId === 'cash_on_pickup';

  const submit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError('');
    try {
      const slug = window.location.pathname.split('/store/')[1]?.split('/')[0] || '';
      if (receipt) await storePaymentService.uploadReceipt(slug, session, receipt);
      await storePaymentService.submitManual(slug, session);
      await onComplete(session.paymentSessionId);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Payment could not be submitted. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="rounded-2xl bg-surface-container-low p-4">
      <p className="font-sans text-xs font-extrabold uppercase tracking-wider text-secondary">{checkout.methodName}</p>
      <p className="mt-2 font-display text-2xl font-bold text-primary">{formatRegionCurrency(total, currency)}</p>
      {checkout.qrCodeUrl && <img src={checkout.qrCodeUrl} alt={`${checkout.methodName} merchant QR code`} className="mx-auto mt-4 max-h-64 w-full rounded-2xl bg-white object-contain p-3" />}
      {checkout.instructions && <p className="mt-4 whitespace-pre-line rounded-2xl bg-white p-4 font-sans text-sm font-bold leading-relaxed text-on-surface-variant">{checkout.instructions}</p>}
      {checkout.receiptAllowed && (
        <label className="mt-4 block rounded-2xl border border-dashed border-outline-variant bg-white p-4 text-center">
          <Upload className="mx-auto h-5 w-5 text-primary" />
          <span className="mt-2 block font-sans text-xs font-extrabold text-primary">Upload payment receipt (optional)</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => setReceipt(event.currentTarget.files?.[0] || null)} className="mt-2 block w-full font-sans text-xs text-on-surface-variant" />
          {receipt && <span className="mt-1 block truncate font-sans text-[11px] font-bold text-on-surface-variant">{receipt.name}</span>}
        </label>
      )}
      {error && <p role="alert" className="mt-3 rounded-2xl bg-error/10 p-3 font-sans text-xs font-bold text-error">{error}</p>}
      <button type="button" disabled={isSubmitting} onClick={submit} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3.5 font-sans text-sm font-extrabold text-on-primary disabled:opacity-50">
        <CheckCircle2 className="h-4 w-4" /> {isSubmitting ? 'Submitting…' : isCash ? 'Place Order' : "I've Completed Payment"}
      </button>
      <button type="button" disabled={isSubmitting} onClick={() => void onBack()} className="mt-2 w-full rounded-full px-5 py-3 font-sans text-xs font-extrabold text-on-surface-variant">Back</button>
    </section>
  );
}

export const manualClientPaymentAdapter: PaymentProviderClientAdapter = {
  provider: 'manual',
  Checkout: ManualCheckout
};
