import { useState } from 'react';
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

function CurlecCheckout({ session, customerName, phone, onComplete, onBack }: PaymentProviderCheckoutProps) {
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);
  const checkout = session.checkout;
  if (checkout.type !== 'curlec_standard_checkout') return null;
  const open = async () => {
    setOpening(true); setError('');
    try {
      await loadCurlecCheckout();
      const razorpay = new window.Razorpay!({
        key: checkout.keyId, order_id: checkout.orderId, amount: checkout.amountMinor,
        currency: checkout.currency, name: checkout.name, description: checkout.description,
        prefill: { name: customerName, contact: phone },
        // MiseChef already collects the customer's phone before payment. Keep
        // Curlec's duplicate contact step out of the checkout flow; email is
        // optional and does not need to be collected again by the gateway.
        hidden: { contact: true, email: true },
        handler: () => { void onComplete(session.paymentSessionId); },
        modal: { ondismiss: () => { setOpening(false); } }
      });
      razorpay.on('payment.failed', () => setError('Payment was not completed. You can try again.'));
      razorpay.open();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Payment checkout could not open.'); }
    finally { setOpening(false); }
  };
  return <div className="space-y-3"><p className="font-sans text-sm font-bold text-on-surface-variant">Choose your preferred payment method on the next step.</p>{error && <p role="alert" className="rounded-2xl bg-error/10 p-3 font-sans text-xs font-bold text-error">{error}</p>}<button type="button" onClick={() => void open()} disabled={opening} className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary">{opening ? 'Opening payment…' : 'Continue to Payment'}</button><button type="button" onClick={() => void onBack()} className="w-full font-sans text-xs font-extrabold text-primary">Back to checkout</button></div>;
}

export const curlecClientPaymentAdapter: PaymentProviderClientAdapter = { provider: 'curlec', Checkout: CurlecCheckout };
