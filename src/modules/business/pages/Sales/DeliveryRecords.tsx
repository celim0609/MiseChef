import type { DailyDeliveryRecord } from '../../dailySalesProjection';

const providerNames = { lalamove: 'Lalamove', grab: 'Grab', private_driver: 'Private driver' };
const headings = ['Delivery date', 'Order', 'Fulfilment', 'Provider', 'Customer fee', 'Actual driver cost', 'Quoted cost', 'Subsidy / surplus', 'Status', 'Tracking reference'];

export default function DeliveryRecords({ deliveries, formatMoney, orderLink }: {
  deliveries: DailyDeliveryRecord[];
  formatMoney: (amount: number) => string;
  orderLink: (orderId: string, fulfilmentId: string) => string;
}) {
  const money = (value?: number) => value === undefined ? '—' : formatMoney(value / 100);
  return (
    <section aria-labelledby="deliveries-heading" className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm">
      <h3 id="deliveries-heading" className="font-display text-xl font-bold text-primary">Delivery Records</h3>
      <p className="mt-2 text-sm">Dates use the saved delivery schedule where available. Subsidy or surplus uses the quote when actual cost is unavailable.</p>
      {deliveries.length ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm [&_td]:px-4 [&_td]:py-3 [&_th]:px-4 [&_th]:py-3">
            <thead className="bg-surface-container-low text-primary"><tr>{headings.map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>
              {deliveries.map(delivery => {
                const cost = delivery.actualCostMinor ?? delivery.quotedCostMinor;
                const balance = cost === undefined ? undefined : delivery.customerFeeMinor - cost;
                return (
                  <tr key={JSON.stringify([delivery.orderId, delivery.fulfilmentId])} className="border-b border-surface-container-high">
                    <td>{delivery.date}</td>
                    <td><a className="font-bold underline" href={orderLink(delivery.orderId, delivery.fulfilmentId)}>{delivery.orderNumber || delivery.orderId}</a></td>
                    <td>{delivery.fulfilmentId}</td>
                    <td>{(delivery.provider && providerNames[delivery.provider]) || 'Unknown'}</td>
                    <td>{money(delivery.customerFeeMinor)}</td>
                    <td>{money(delivery.actualCostMinor)}</td>
                    <td>{money(delivery.quotedCostMinor)}</td>
                    <td>{balance === undefined ? '—' : `${money(Math.abs(balance))} ${balance > 0 ? 'surplus' : 'subsidy'}`}</td>
                    <td className="capitalize">{delivery.status.replaceAll('_', ' ')}</td>
                    <td>{delivery.trackingReference || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="mt-4 text-sm">No deliveries in this period.</p>}
    </section>
  );
}
