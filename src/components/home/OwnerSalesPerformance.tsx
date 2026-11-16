import React from 'react';
import { ArrowRight } from 'lucide-react';
import type { BusinessDailyTrend } from '../../modules/business/types';
import { formatRegionCurrency, type RegionCurrency } from '../../regions';
import type { OwnerMetricState } from './OwnerHomeWidgets';

const salesStateMessage = {
  loading: 'Loading daily sales…',
  'no-data': 'No sales recorded this month.',
  'permission-denied': 'Sales data is unavailable with your workspace access.',
  error: 'Daily sales could not be loaded. Use Retry above.'
};

export default function OwnerSalesPerformance({ trend, state, currency, locale, onViewSales }: {
  trend: BusinessDailyTrend[];
  state: OwnerMetricState;
  currency: RegionCurrency;
  locale: string;
  onViewSales?: () => void;
}) {
  const formatCurrency = (value: number) => formatRegionCurrency(value, currency);
  const dateFormat = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const formatDate = (date: string) => dateFormat.format(new Date(date));
  const max = Math.max(0, ...trend.map(day => day.sales));
  const min = Math.min(0, ...trend.map(day => day.sales));
  const range = max - min || 1;
  const zero = max === min ? 100 : max / range * 100;
  const firstDate = trend[0]?.date;
  const lastDate = trend.at(-1)?.date;

  return (
    <section className="min-w-0 rounded-2xl border border-surface-container-high bg-surface-container-lowest p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="font-display text-2xl font-bold leading-none text-primary">Sales Performance</h2>
          <p className="mt-1 text-xs font-semibold text-on-surface-variant">Daily recognized sales · {currency}</p>
        </div>
        {onViewSales && (
          <button type="button" onClick={onViewSales}
            className="inline-flex min-h-11 items-center gap-1.5 rounded px-1 text-sm font-extrabold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary">
            Sales Records <ArrowRight aria-hidden="true" className="size-4" />
          </button>
        )}
      </div>
      {state !== 'ready' || !firstDate || !lastDate ? (
        <p role="status" className="mt-3 rounded-xl bg-surface-container-low p-3 text-sm text-on-surface-variant">
          {state === 'ready' ? salesStateMessage['no-data'] : salesStateMessage[state]}
        </p>
      ) : (
        <>
          <div aria-hidden="true" className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 sm:gap-x-3">
            <div className="relative flex flex-col justify-between text-right text-[11px] font-semibold tabular-nums text-on-surface-variant">
              <span>{max !== min && formatCurrency(max)}</span>
              <span>{formatCurrency(min)}</span>
            </div>
            <div className="relative flex h-32 gap-px rounded-t bg-surface-container-low px-1 sm:h-44 sm:gap-1">
              <div className="absolute inset-x-0 top-1/2 border-t border-surface-container-high" />
              <div className="absolute inset-x-0 border-t border-outline/60" style={{ top: `${zero}%` }} />
              {trend.map(day => (
                <div key={day.date} className="relative min-w-0 flex-1" title={`${formatDate(day.date)} · ${formatCurrency(day.sales)}`}>
                  <div className="absolute inset-x-0 rounded-sm bg-primary-container" style={{
                    top: `${day.sales > 0 ? (max - day.sales) / range * 100 : zero}%`,
                    height: `${Math.abs(day.sales) / range * 100}%`
                  }} />
                </div>
              ))}
            </div>
            <div className="col-start-2 flex justify-between text-xs font-semibold text-on-surface-variant">
              <span>{formatDate(firstDate)}</span>
              {firstDate !== lastDate && <span>{formatDate(lastDate)}</span>}
            </div>
          </div>
          <details className="mt-2">
            <summary className="w-fit cursor-pointer rounded py-3 text-xs font-extrabold text-primary focus-visible:outline-2 focus-visible:outline-primary">
              View daily sales values
            </summary>
            <table className="w-full text-sm tabular-nums">
              <caption className="sr-only">Daily recognized sales</caption>
              <thead><tr className="border-b border-surface-container-high"><th scope="col" className="py-1.5 text-left">Date</th><th scope="col" className="text-right">Sales</th></tr></thead>
              <tbody className="divide-y divide-surface-container-high">
                {trend.map(day => (
                  <tr key={day.date}>
                    <th scope="row" className="py-1.5 text-left font-normal"><time dateTime={day.date}>{formatDate(day.date)}</time></th>
                    <td className="text-right">{formatCurrency(day.sales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}
