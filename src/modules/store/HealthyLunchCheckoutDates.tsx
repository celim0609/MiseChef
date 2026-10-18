import { scheduleDateLabel } from './storeOrderFulfilments';

export function HealthyLunchCheckoutDates({ dates, method }: { dates: string[]; method: 'pickup' | 'delivery' }) {
  return <div className="mt-2 text-sm font-bold">
    {[...new Set(dates)].sort().map(date => <p key={date}>Selected {method} date: {scheduleDateLabel(date).replace(/^(\w{3}) /, '$1, ')}</p>)}
    <p>Choose {method} time within Store hours.</p>
  </div>;
}
