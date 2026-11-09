import { formatRegionCurrency } from '../../regions';
import { formatPickupDateLabel } from './storeModel';
import type { StoreOrder } from './types';

import { getStoreOrderBreakdown, isAmount, minor } from './storeOrderBreakdown';

export default function StoreOrderTotals({ order, currency, country }: {
  order: StoreOrder;
  currency: string;
  country?: unknown;
}) {
  const { subtotal, discount, deliveryFee, deliveryDates, dates, savedDays, finalTotal } = getStoreOrderBreakdown(order);
  const { totals, deliveryPricingSnapshot: snapshot } = order;
  const format = (value: number | undefined) => isAmount(value)
    ? ((totals?.currency ?? currency) === 'MYR' ? `RM${value.toFixed(2)}` : formatRegionCurrency(value, totals?.currency ?? currency))
    : 'Not available';

  // Older checkout snapshots record a flat charge per fulfilment and its saved total.
  const flatFee = snapshot?.firstDayFee;
  const hasFlatFee = !savedDays.length && isAmount(flatFee) && isAmount(deliveryFee)
    && snapshot?.fulfilmentCount === dates.length && deliveryDates.length === dates.length
    && minor(flatFee) * dates.length === minor(deliveryFee);

  return (
    <dl aria-label="Order totals" className="mt-5 space-y-2 border-t border-surface-container-high pt-4 font-sans text-sm font-bold text-primary">
      <div className="flex justify-between gap-3"><dt>Subtotal</dt><dd className="text-right">{format(subtotal)}</dd></div>
      {dates.length > 1 && dates.map(date => {
        const charges = savedDays.filter(day => day.date === date).map(day => day.customerDeliveryFee);
        const expected = deliveryDates.filter(day => day === date).length;
        const fee = hasFlatFee ? flatFee : charges.length && charges.length >= expected && charges.every(isAmount)
          ? charges.reduce((sum, charge) => sum + minor(charge), 0) / 100
          : undefined;
        return (
          <div key={date} className="flex justify-between gap-3 text-on-surface-variant">
            <dt>Delivery Fee · {formatPickupDateLabel(date, country)}</dt><dd className="text-right">{format(fee)}</dd>
          </div>
        );
      })}
      <div className="flex justify-between gap-3"><dt>{dates.length > 1 ? 'Total Delivery Fee' : 'Delivery Fee'}</dt><dd className="text-right">{format(deliveryFee)}</dd></div>
      {isAmount(discount) && discount > 0 && (
        <div className="flex justify-between gap-3"><dt>Discounts</dt><dd className="text-right">−{format(discount)}</dd></div>
      )}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-surface-container-high pt-3">
        <dt className="font-extrabold">Final Total</dt>
        <dd className="font-display text-2xl">{format(finalTotal)}</dd>
      </div>
    </dl>
  );
}
