import { useRef, useState } from 'react';
import { formatRegionCurrency } from '../../../regions';
import type { PaymentProviderCheckoutProps, PaymentProviderClientAdapter } from './types';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (name: string, listener: (response: unknown) => void) => void };
  }
}

const loadCurlecCheckout = () => new Promise<void>((resolve, reject) => {
  if (window.Razorpay) return resolve();
  const script = document.createElement('script');
  script.src = 'https://checkout.razorpay.com/v1/checkout.js';
  script.async = true;
  script.onload = () => window.Razorpay ? resolve() : reject(new Error('Curlec checkout did not load.'));
  script.onerror = () => reject(new Error('Curlec checkout could not load.'));
  document.head.appendChild(script);
});

const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

export function normalizeCurlecContact(phone: string) {
  const contact = phone.trim();
  if (/^\+60\d+$/.test(contact)) return contact;
  if (/^60\d+$/.test(contact)) return `+${contact}`;
  if (/^0\d+$/.test(contact)) return `+60${contact.slice(1)}`;
  return contact;
}

export function getCurlecPrefill(customerName: string, phone: string, customerEmail: string) {
  return {
    name: customerName,
    contact: normalizeCurlecContact(phone),
    ...(customerEmail.trim() ? { email: customerEmail.trim() } : {})
  };
}

function CurlecCheckout({ session, customerName, phone, customerEmail, onComplete, onBack }: PaymentProviderCheckoutProps) {
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmationSlow, setConfirmationSlow] = useState(false);
  const checkoutOpenRef = useRef(false);
  const confirmationRunRef = useRef(false);
  const checkout = session.checkout;
  if (checkout.type !== 'curlec_standard_checkout') return null;

  const releaseCheckoutLock = () => {
    checkoutOpenRef.current = false;
    setOpening(false);
  };

  const confirmPayment = async () => {
    if (confirmationRunRef.current) return;
    confirmationRunRef.current = true;
    checkoutOpenRef.current = true;
    setOpening(false);
    setConfirming(true);
    setConfirmationSlow(false);
    setError('');
    try {
      // Curlec can return the customer to MiseChef before its webhook has
      // finished updating the order. Re-check the same payment session for a
      // short window and never offer a second payment while confirmation is in flight.
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await onComplete(session.paymentSessionId);
        if (attempt < 7) await wait(1500);
      }
      setConfirmationSlow(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We could not confirm this payment yet.');
      setConfirmationSlow(true);
    } finally {
      confirmationRunRef.current = false;
    }
  };

  const open = async () => {
    if (checkoutOpenRef.current || confirming) return;
    checkoutOpenRef.current = true;
    setOpening(true);
    setError('');
    try {
      await loadCurlecCheckout();
      const razorpay = new window.Razorpay!({
        key: checkout.keyId, order_id: checkout.orderId, amount: checkout.amountMinor,
        currency: checkout.currency, name: checkout.name, description: checkout.description,
        prefill: getCurlecPrefill(customerName, phone, customerEmail),
        // MiseChef already collects the customer's phone before payment. Keep
        // Curlec's duplicate contact step out of the checkout flow; email is
        // optional and does not need to be collected again by the gateway.
        hidden: { contact: true, email: true },
        config: {
          display: {
            hide: [{ method: 'fpx' }, { method: 'card' }]
          }
        },
        handler: () => { void confirmPayment(); },
        modal: { ondismiss: () => { if (!confirming) releaseCheckoutLock(); } }
      });
      razorpay.on('payment.failed', () => {
        setError('Payment was not completed. You can try again.');
        releaseCheckoutLock();
      });
      razorpay.open();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Payment checkout could not open.');
      releaseCheckoutLock();
    }
  };

  if (confirming) {
    return <div className="space-y-3 rounded-2xl bg-primary/5 p-4"><p role="status" className="font-sans text-sm font-extrabold text-primary">{confirmationSlow ? 'Payment confirmation is taking a little longer.' : 'Confirming your payment…'}</p><p className="font-sans text-xs font-bold leading-relaxed text-on-surface-variant">Please do not pay again. We are checking the payment you just made.</p>{error && <p role="alert" className="rounded-2xl bg-error/10 p-3 font-sans text-xs font-bold text-error">{error}</p>}{confirmationSlow && <button type="button" onClick={() => void confirmPayment()} disabled={confirmationRunRef.current} className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary disabled:opacity-60">Check payment status</button>}</div>;
  }

  const paymentLabel = session.orderSummary ? `Continue to Payment · ${formatRegionCurrency(session.orderSummary.totals.grandTotal, session.orderSummary.totals.currency)}` : 'Continue to Payment';
  return <div className="space-y-3"><p className="font-sans text-sm font-bold text-on-surface-variant">Choose your preferred payment method on the next step.</p>{error && <p role="alert" className="rounded-2xl bg-error/10 p-3 font-sans text-xs font-bold text-error">{error}</p>}<button type="button" onClick={() => void open()} disabled={opening} className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary">{opening ? 'Payment open…' : paymentLabel}</button><button type="button" onClick={() => void onBack()} disabled={opening} className="w-full font-sans text-xs font-extrabold text-primary disabled:opacity-50">Back to checkout</button></div>;
}

export const curlecClientPaymentAdapter: PaymentProviderClientAdapter = { provider: 'curlec', Checkout: CurlecCheckout };
