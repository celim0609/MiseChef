import { WEEKLY_DAYS, getWeeklyDates, datedWeeks, resolveWeeklyMeals, weekRangeLabel } from '../../../functions/storeWeeklyMealPlan.js';
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
  onChange: (choice: HealthyLunchChoice) => void;
}

export default function HealthyLunchMenu({ product, products, currency, weeks, dayDates, choice, monday = '', onChange }: Props) {
  const options = choice.mode === 'week' ? weeks : dayDates;
  const date = options.includes(choice.date) ? choice.date : options[0] || '';
  const dated = product.weeklyWeeks !== undefined;
  const selectedMonday = choice.mode === 'week' ? date : datedWeeks(product).find(week => getWeeklyDates(week.startMonday).includes(date))?.startMonday || '';
  const meals = resolveWeeklyMeals(product, dated ? selectedMonday : monday);
  const changeChoice = (mode: 'week' | 'day', date: string) => onChange({ mode, date });
  return <div className="mt-3 rounded-xl bg-surface-container-low p-3">
    {dated ? <><div className="flex gap-2" role="group" aria-label={`${product.name} ordering`}>
      <button type="button" aria-pressed={choice.mode === 'week'} onClick={() => changeChoice('week', weeks[0] || '')} className="rounded-full border px-3 py-2 text-sm font-bold aria-pressed:bg-primary aria-pressed:text-white">5-Day Plan</button>
      <button type="button" aria-pressed={choice.mode === 'day'} onClick={() => changeChoice('day', dayDates[0] || '')} className="rounded-full border px-3 py-2 text-sm font-bold aria-pressed:bg-primary aria-pressed:text-white">Order by Day</button>
    </div><label className="mt-3 block text-sm font-bold">{choice.mode === 'week' ? 'Choose dates' : 'Choose a date'}
      <select aria-label={`${product.name} dates`} value={date} onChange={event => changeChoice(choice.mode, event.target.value)} className="mt-1 w-full rounded-xl border p-2">
        {!options.length && <option value="">No available dates</option>}{options.map(date => <option key={date} value={date}>{choice.mode === 'week' ? weekRangeLabel(date) : dateLabel(date)}</option>)}
      </select></label></> : <p className="text-sm font-extrabold text-primary">5-Day Plan · Mon–Fri</p>}
    <ul className="mt-2 space-y-2">{WEEKLY_DAYS.filter((_, index) => !dated || (choice.mode === 'week' ? Boolean(date) : getWeeklyDates(selectedMonday)[index] === date)).map(day => {
      const meal = products.find(candidate => candidate.id === meals?.[day]);
      const dayDate = getWeeklyDates(dated ? selectedMonday : monday)[WEEKLY_DAYS.indexOf(day)];
      return <li key={day} className="flex items-center gap-2 text-sm font-bold text-primary">{meal?.photoUrl && <img src={meal.photoUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />}<span>{dayDate ? dateLabel(dayDate) : day.toUpperCase()}: {meal?.name || 'Meal unavailable'}{dated && choice.mode === 'day' && meal ? ` · ${formatRegionCurrency(meal.price, currency)}` : ''}</span></li>;
    })}</ul>
  </div>;
}
