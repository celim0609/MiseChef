import { formatRegionCurrency } from '../../regions';
import type { StorePaymentOrderSummary } from './types';

export default function PaymentOrderSummary({ summary }: { summary: StorePaymentOrderSummary }) {
  return (
    <section aria-label="Order Summary" className="rounded-2xl border border-surface-container-high bg-white p-4">
      <h4 className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-secondary">Order Summary</h4>
      <div className="mt-3 space-y-3">
        {summary.items.map((item, index) => (
          <div key={`${item.productName}_${index}`} className="border-b border-surface-container-high pb-3 last:border-0 last:pb-0">
            <div className="flex justify-between gap-3 font-sans text-sm font-extrabold text-primary"><span>{item.quantity} × {item.productName}</span><span>{formatRegionCurrency(item.lineTotal, summary.totals.currency)}</span></div>
            {item.setSnapshot?.selectedGroups.map((selection, selectionIndex) => <p key={`${selection.groupName}_${selectionIndex}`} className="mt-1 font-sans text-xs font-bold text-on-surface-variant">{selection.groupName}: {selection.productName}{selection.priceAdjustment > 0 ? ` (+${formatRegionCurrency(selection.priceAdjustment, summary.totals.currency)})` : ''}</p>)}
            {item.selectedOptions.map((option, optionIndex) => <p key={`${option.groupName}_${optionIndex}`} className="mt-1 font-sans text-xs font-bold text-on-surface-variant">{option.groupName}: {option.optionName}{option.priceAdjustment !== 0 ? ` (${option.priceAdjustment > 0 ? '+' : '−'}${formatRegionCurrency(Math.abs(option.priceAdjustment), summary.totals.currency)})` : ''}</p>)}
          </div>
        ))}
      </div>
      <dl className="mt-3 space-y-2 border-t border-surface-container-high pt-3 font-sans text-sm font-bold text-primary">
        <div className="flex justify-between gap-3"><dt>Items subtotal</dt><dd>{formatRegionCurrency(summary.totals.merchandiseSubtotal, summary.totals.currency)}</dd></div>
        {summary.totals.discountTotal > 0 && <div className="flex justify-between gap-3"><dt>Discount</dt><dd>−{formatRegionCurrency(summary.totals.discountTotal, summary.totals.currency)}</dd></div>}
        {summary.fulfilmentMethod === 'delivery' && <div className="flex justify-between gap-3"><dt>Delivery fee</dt><dd>{formatRegionCurrency(summary.totals.deliveryFee, summary.totals.currency)}</dd></div>}
        <div className="flex justify-between gap-3 border-t border-surface-container-high pt-2 text-base font-extrabold"><dt>Total</dt><dd>{formatRegionCurrency(summary.totals.grandTotal, summary.totals.currency)}</dd></div>
      </dl>
    </section>
  );
}
