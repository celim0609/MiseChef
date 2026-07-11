import { useEffect, useState, type FormEvent } from 'react';
import { Plus, ReceiptText } from 'lucide-react';
import { businessService } from '../../services';
import { getCustomerFriendlyErrorMessage } from '../../../../utils/customerErrorMessages';
import type { BusinessSale } from '../../types';

interface BusinessSalesPageProps {
  userId?: string;
  workspaceId?: string;
}

const todayDate = () => new Date().toISOString().slice(0, 10);
const formatMoney = (value: number) => `SGD ${Number(value || 0).toFixed(2)}`;

const notifySalesChanged = () => {
  window.dispatchEvent(new CustomEvent('misechef:sales-changed'));
};

export default function BusinessSalesPage({ userId, workspaceId }: BusinessSalesPageProps) {
  const [sales, setSales] = useState<BusinessSale[]>([]);
  const [date, setDate] = useState(todayDate());
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isCancelled = false;

    const loadSales = async () => {
      setIsLoading(true);
      setErrorMessage('');
      try {
        const loadedSales = await businessService.listSales(workspaceId || userId);
        if (!isCancelled) setSales(loadedSales);
      } catch (err) {
        if (!isCancelled) setErrorMessage(getCustomerFriendlyErrorMessage(err, 'Unable to load sales.'));
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    loadSales();

    return () => {
      isCancelled = true;
    };
  }, [userId, workspaceId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!userId) {
      setErrorMessage('Sign in to record sales.');
      return;
    }

    const numericAmount = Number(amount);
    if (!date || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      setErrorMessage('Enter a valid date and sales amount.');
      return;
    }

    setIsSaving(true);
    setMessage('');
    setErrorMessage('');
    try {
      const sale = await businessService.createSale({ date, amount: numericAmount, notes }, userId, workspaceId || userId);
      setSales(current => [sale, ...current]);
      setAmount('');
      setNotes('');
      notifySalesChanged();
      setMessage('Daily sales recorded.');
    } catch (err) {
      setErrorMessage(getCustomerFriendlyErrorMessage(err, 'Unable to record sales.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="bg-surface-container-low border border-surface-container-high rounded-2xl p-6 sm:p-8 shadow-sm">
        <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Business</p>
        <h2 className="font-display text-3xl sm:text-4xl font-bold text-primary tracking-tight mt-1">Sales</h2>
        <p className="mt-3 font-sans text-sm font-bold text-on-surface-variant">Manually record daily sales for dashboard reporting.</p>
      </section>

      {(message || errorMessage) && <p className={`rounded-2xl border p-4 font-sans text-sm font-bold ${errorMessage ? 'border-error/30 bg-error/10 text-error' : 'border-primary/20 bg-primary/10 text-primary'}`}>{errorMessage || message}</p>}

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <form onSubmit={handleSubmit} className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm space-y-4">
          <div>
            <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-primary">Record Daily Sales</p>
            <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">Use one entry per day or add corrections as needed.</p>
          </div>
          <label className="block">
            <span className="font-sans text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Date</span>
            <input type="date" value={date} onChange={event => setDate(event.target.value)} className="mt-2 w-full rounded-xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
          </label>
          <label className="block">
            <span className="font-sans text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Sales Amount</span>
            <input type="number" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} className="mt-2 w-full rounded-xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
          </label>
          <label className="block">
            <span className="font-sans text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Notes</span>
            <textarea value={notes} onChange={event => setNotes(event.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
          </label>
          <button type="submit" disabled={isSaving} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary disabled:opacity-50">
            <Plus className="h-4 w-4" />
            {isSaving ? 'Saving...' : 'Record Sales'}
          </button>
        </form>

        <div className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-primary">Sales History</p>
              <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">Recent manual sales entries.</p>
            </div>
            <ReceiptText className="h-6 w-6 text-outline" />
          </div>
          <div className="mt-5 overflow-x-auto rounded-2xl border border-surface-container-high">
            <table className="w-full min-w-[560px] text-left font-sans text-sm">
              <thead className="bg-surface-container-low text-primary">
                <tr>
                  {['Date', 'Sales Amount', 'Notes'].map(header => <th key={header} className="px-4 py-3 text-xs font-extrabold uppercase tracking-[0.14em]">{header}</th>)}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={3} className="px-4 py-10 text-center font-bold text-on-surface-variant">Loading sales...</td></tr>
                ) : sales.length > 0 ? sales.map(sale => (
                  <tr key={sale.id} className="border-t border-surface-container-high">
                    <td className="px-4 py-3 font-extrabold text-primary">{sale.date}</td>
                    <td className="px-4 py-3 font-bold text-on-surface-variant">{formatMoney(sale.amount)}</td>
                    <td className="px-4 py-3 font-bold text-on-surface-variant">{sale.notes || '-'}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={3} className="px-4 py-10 text-center font-bold text-on-surface-variant">No sales recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
