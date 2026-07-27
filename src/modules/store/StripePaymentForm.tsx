import { useMemo, useState, type FormEvent } from 'react';
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe
} from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import type { RegionCurrency } from '../../regions';
import { formatRegionCurrency } from '../../regions';

interface StripePaymentFormProps {
  clientSecret: string;
  paymentSessionId: string;
  customerName: string;
  phone: string;
  currency: RegionCurrency;
  total: number;
  returnUrl: string;
  onComplete: (paymentSessionId: string) => Promise<void>;
  onBack: () => Promise<void>;
}

interface InnerPaymentFormProps extends Omit<StripePaymentFormProps, 'clientSecret'> {}

const PAYMENT_RETRY_MESSAGE = 'Payment could not be completed. Check your payment details and try again.';

function InnerPaymentForm({
  paymentSessionId,
  customerName,
  phone,
  currency,
  total,
  returnUrl,
  onComplete,
  onBack
}: InnerPaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isPaying, setIsPaying] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const submitPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!stripe || !elements || isPaying) return;
    setErrorMessage('');
    setIsPaying(true);
    try {
      let confirmation;
      try {
        confirmation = await stripe.confirmPayment({
          elements,
          confirmParams: {
            return_url: returnUrl,
            payment_method_data: {
              billing_details: {
                name: customerName,
                phone
              }
            }
          },
          redirect: 'if_required'
        });
      } catch {
        setErrorMessage(PAYMENT_RETRY_MESSAGE);
        return;
      }

      const { error, paymentIntent } = confirmation;
      if (error) {
        setErrorMessage(error.message || PAYMENT_RETRY_MESSAGE);
        return;
      }

      try {
        await onComplete(paymentIntent?.id || paymentSessionId);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'We could not verify this payment yet. Please try again.');
      }
    } finally {
      setIsPaying(false);
    }
  };

  const returnToOrder = async () => {
    if (isPaying || isCancelling) return;
    setErrorMessage('');
    setIsCancelling(true);
    try {
      await onBack();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Payment could not be cancelled. Please try again.');
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <form onSubmit={submitPayment} className="space-y-4">
      <div className="rounded-2xl bg-surface-container-low p-4">
        <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-secondary">Secure payment</p>
        <p className="mt-1 font-display text-2xl font-bold text-primary">{formatRegionCurrency(total, currency)}</p>
      </div>
      <PaymentElement options={{
        fields: {
          billingDetails: {
            name: 'never',
            email: 'auto',
            phone: 'never',
            address: 'if_required'
          }
        },
        wallets: {
          applePay: 'auto',
          googlePay: 'auto'
        }
      }} />
      {errorMessage && (
        <p role="alert" className="rounded-2xl bg-error/10 p-3 font-sans text-xs font-bold text-error">{errorMessage}</p>
      )}
      <button type="submit" disabled={!stripe || !elements || isPaying} className="w-full rounded-full bg-primary px-5 py-3.5 font-sans text-sm font-extrabold text-on-primary disabled:opacity-50">
        {isPaying ? 'Processing Payment…' : `Pay ${formatRegionCurrency(total, currency)}`}
      </button>
      <button type="button" onClick={returnToOrder} disabled={isPaying || isCancelling} className="w-full rounded-full border border-surface-container-high bg-white px-5 py-3 font-sans text-xs font-extrabold text-primary disabled:opacity-50">
        {isCancelling ? 'Returning…' : 'Back to order details'}
      </button>
      <p className="text-center font-sans text-[10px] font-bold text-outline">Payments are encrypted and processed securely by Stripe.</p>
    </form>
  );
}

export default function StripePaymentForm(props: StripePaymentFormProps) {
  const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim() || '';
  const stripe = useMemo(
    () => /^pk_(test|live)_/.test(publishableKey)
      ? loadStripe(publishableKey)
      : Promise.resolve(null),
    [publishableKey]
  );
  if (!/^pk_(test|live)_/.test(publishableKey)) {
    return (
      <p role="alert" className="rounded-2xl bg-error/10 p-3 font-sans text-xs font-bold text-error">
        Secure online payment is temporarily unavailable. Please try again later.
      </p>
    );
  }
  return (
    <Elements stripe={stripe} options={{
      clientSecret: props.clientSecret,
      appearance: {
        theme: 'stripe',
        variables: {
          colorPrimary: '#3e5641',
          borderRadius: '16px',
          fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
        }
      }
    }}>
      <InnerPaymentForm {...props} />
    </Elements>
  );
}
