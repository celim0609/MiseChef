import { WEEKLY_DAYS, getWeeklyDates, weekRangeLabel, resolvePlanMeal, resolveHealthyLunchDay, hasDatedMenu } from '../../../functions/storeWeeklyMealPlan.js';
import { formatRegionCurrency } from '../../regions';
import { scheduleDateLabel } from './storeOrderFulfilments';
import type { StoreProduct, WorkspaceStore } from './types';

const dateLabel = (date: string) => scheduleDateLabel(date).replace(/^(\w{3}) /, '$1, ');

export interface HealthyLunchChoice { mode: 'week' | 'day'; date: string }
interface Props {
  product: StoreProduct;
  products: StoreProduct[];
  currency: WorkspaceStore['currency'];
  weeks: string[];
  dayDates: string[];
  choice: HealthyLunchChoice;
  monday?: string;
  canOrder?: boolean;
  onChange: (choice: HealthyLunchChoice) => void;
  onAdd?: (choice: HealthyLunchChoice) => void;
}

export default function HealthyLunchMenu({ product, products, currency, weeks, dayDates, choice, monday = '', canOrder = true, onChange, onAdd }: Props) {
  const dated = hasDatedMenu(product);
  const date = weeks.includes(choice.date) ? choice.date : weeks[0] || '';
  const selectedMonday = dated ? date : monday || date;
  const showDays = dated && choice.mode === 'day';
  const dailyMeals = [...new Set(dayDates)].sort().flatMap(date => {
    const meal = resolveHealthyLunchDay(product, products, date);
    return meal ? [{ date, meal }] : [];
  });
  return <div className="mt-3 rounded-2xl bg-surface-container-low p-3 sm:p-4">
    {dated ? <div className="flex gap-2" role="group" aria-label={`${product.name} ordering`}>
      <button type="button" aria-pressed={!showDays} onClick={() => onChange({ mode: 'week', date })} className="rounded-full border px-4 py-2 text-sm font-bold aria-pressed:bg-primary aria-pressed:text-white">5-Day Plan</button>
      <button type="button" aria-pressed={showDays} onClick={() => onChange({ mode: 'day', date })} className="rounded-full border px-4 py-2 text-sm font-bold aria-pressed:bg-primary aria-pressed:text-white">Order by Day</button>
    </div> : <p className="text-sm font-extrabold text-primary">5-Day Plan · Mon–Fri</p>}

    {showDays ? <>
      {!dailyMeals.length && <p className="mt-4 text-sm text-on-surface-variant">No meals are currently available to order.</p>}
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{dailyMeals.map(({ date, meal }) => <li key={date} className="flex flex-col overflow-hidden rounded-2xl border border-surface-container-high bg-white">
        {meal.photoUrl && <img src={meal.photoUrl} alt={meal.name} className="h-40 w-full object-cover" referrerPolicy="no-referrer" />}
        <div className="flex flex-1 flex-col p-3">
          <time dateTime={date} className="text-xs font-extrabold text-secondary">{dateLabel(date)}</time>
          <h5 className="mt-1 text-base font-extrabold text-primary">{meal.name}</h5>
          {meal.calories !== undefined && <p className="mt-1 text-xs font-bold text-on-surface-variant">{meal.calories} kcal</p>}
          {meal.description && <p className="mt-1 line-clamp-2 text-sm text-on-surface-variant">{meal.description}</p>}
          <div className="mt-auto flex items-center justify-between gap-3 pt-3">
            <p className="font-extrabold text-primary">{formatRegionCurrency(meal.price, currency)}</p>
            <button type="button" aria-label={`Add ${meal.name}`} disabled={!canOrder} onClick={() => onAdd?.({ mode: 'day', date })} className="min-h-11 rounded-full bg-primary px-5 py-2 text-sm font-extrabold text-on-primary disabled:cursor-not-allowed disabled:opacity-45">Add</button>
          </div>
        </div>
      </li>)}</ul>
    </> : <>
      {dated && <label className="mt-4 block text-sm font-bold text-primary">Available weeks
        <select aria-label={`${product.name} dates`} value={date} onChange={event => onChange({ mode: 'week', date: event.target.value })} className="mt-1 w-full rounded-xl border bg-white p-3 sm:max-w-xs">
          {!weeks.length && <option value="">No available dates</option>}{weeks.map(date => <option key={date} value={date}>{weekRangeLabel(date)}</option>)}
        </select>
      </label>}
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{WEEKLY_DAYS.filter(() => !dated || Boolean(date)).map((day, index) => {
        const meal = resolvePlanMeal(product, products, selectedMonday, day);
        const dayDate = getWeeklyDates(selectedMonday)[index];
        return <li key={day} className="overflow-hidden rounded-2xl border border-surface-container-high bg-white">
          {meal?.photoUrl && <img src={meal.photoUrl} alt={meal.name} className="h-32 w-full object-cover" referrerPolicy="no-referrer" />}
          <div className="p-3">
            <p className="text-xs font-extrabold text-secondary">{dayDate ? dateLabel(dayDate) : day.toUpperCase()}</p>
            <h5 className="mt-1 text-sm font-extrabold text-primary">{meal?.name || 'Meal unavailable'}</h5>
            {meal?.calories !== undefined && <p className="mt-1 text-xs text-on-surface-variant">{meal.calories} kcal</p>}
            {meal?.description && <p className="mt-1 line-clamp-2 text-xs text-on-surface-variant">{meal.description}</p>}
          </div>
        </li>;
      })}</ul>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-lg font-extrabold text-primary">{formatRegionCurrency(product.price, currency)}</p>
        <button type="button" disabled={!canOrder || (dated && !date)} onClick={() => onAdd?.({ mode: 'week', date })} className="min-h-12 rounded-full bg-primary px-6 py-3 text-sm font-extrabold text-on-primary disabled:cursor-not-allowed disabled:opacity-45">Add 5-Day Plan</button>
      </div>
    </>}
  </div>;
}
