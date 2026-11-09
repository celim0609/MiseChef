import { formatRegionCurrency } from '../../regions';
import { formatPickupDateLabel } from './storeModel';
import type { StoreOrder } from './types';

import { getStoreOrderBreakdown, isAmount } from './storeOrderBreakdown';

export default function StoreOrderTotals({ order, currency, country }: {
  order: StoreOrder;
  currency: string;
  country?: unknown;
}) {
  const { subtotal, discount, deliveryFee, dailyDeliveryFees, finalTotal } = getStoreOrderBreakdown(order);
  const { totals } = order;
  const format = (value: number | undefined) => isAmount(value)
    ? ((totals?.currency ?? currency) === 'MYR' ? `RM${value.toFixed(2)}` : formatRegionCurrency(value, totals?.currency ?? currency))
    : 'Not available';

  return (
    <dl aria-label="Order totals" className="mt-5 space-y-2 border-t border-surface-container-high pt-4 font-sans text-sm font-bold text-primary">
      <div className="flex justify-between gap-3"><dt>Subtotal</dt><dd className="text-right">{format(subtotal)}</dd></div>
      {dailyDeliveryFees.some(day => day.amount !== undefined) && dailyDeliveryFees.map(({ date, amount }) => (
        <div key={date} className="flex justify-between gap-3 text-on-surface-variant">
          <dt>Delivery Fee · {formatPickupDateLabel(date, country)}</dt><dd className="text-right">{format(amount)}</dd>
        </div>
      ))}
      <div className="flex justify-between gap-3"><dt>{dailyDeliveryFees.length ? 'Total Delivery Fee' : 'Delivery Fee'}</dt><dd className="text-right">{format(deliveryFee)}</dd></div>
      {dailyDeliveryFees.length > 0 && dailyDeliveryFees.every(day => day.amount === undefined) && (
        <div className="flex justify-between gap-3 text-on-surface-variant">
          <dt>Daily delivery breakdown</dt><dd className="text-right">Not available</dd>
        </div>
      )}
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
