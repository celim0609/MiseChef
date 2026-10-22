import { useState } from 'react';
import { snapshotMealOptions } from '../../../functions/healthyLunchOptions.js';
import HealthyLunchMealOptions from './HealthyLunchMealOptions';
import type { MealOptionChoice } from './types';
import { weeklyPricing, WEEKLY_DAYS, getWeeklyDates, weekRangeLabel, resolvePlanMeal, resolveHealthyLunchDay, hasDatedMenu } from '../../../functions/storeWeeklyMealPlan.js';
import { formatRegionCurrency } from '../../regions';
import { scheduleDateLabel } from './storeOrderFulfilments';
import type { StoreProduct, WorkspaceStore } from './types';

const dateLabel = (date: string) => scheduleDateLabel(date).replace(/^(\w{3}) /, '$1, ');

export interface HealthyLunchChoice { mode: 'week' | 'day'; date: string; selectedMealOptions?: MealOptionChoice[] }
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
  const [choices, setChoices] = useState<MealOptionChoice[]>([]);
  const dated = hasDatedMenu(product);
  const date = weeks.includes(choice.date) ? choice.date : weeks[0] || '';
  const selectedMonday = dated ? date : monday || date;
  const showDays = dated && choice.mode === 'day';
  const dailyMeals = [...new Set(dayDates)].sort().flatMap(date => {
    const meal = resolveHealthyLunchDay(product, products, date);
    return meal ? [{ date, meal }] : [];
  });
  const selected = (dates: string[]) => choices.filter(choice => dates.includes(choice.serviceDate));
  const optionState = (dates: string[]) => {
    try {
      const snapshots = dates.map(date => snapshotMealOptions(resolveHealthyLunchDay(product, products, date) || {}, date, selected([date])));
      return { error: '', surchargeMinor: snapshots.reduce((sum, day) => sum + (day.optionSurchargeUnitMinor || 0), 0) };
    } catch (error) { return { error: (error as Error).message, surchargeMinor: 0 }; }
  };
  const weekDates = getWeeklyDates(selectedMonday);
  const weekOptions = optionState(weekDates);
  const pricing = (!dated || selectedMonday) ? weeklyPricing(product, products, selectedMonday) : null;
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
          <HealthyLunchMealOptions groups={meal.optionGroups} date={date} choices={choices} onChange={setChoices} />
          {optionState([date]).error && <p className="mt-2 text-xs" role="status">Complete required choices to add this meal.</p>}
          <div className="mt-auto flex items-center justify-between gap-3 pt-3">
            <p className="font-extrabold text-primary">{formatRegionCurrency((Math.round(meal.price * 100) + optionState([date]).surchargeMinor) / 100, currency)}</p>
            <button type="button" aria-label={`Add ${meal.name}`} disabled={!canOrder || Boolean(optionState([date]).error)} onClick={() => onAdd?.({ mode: 'day', date, selectedMealOptions: selected([date]) })} className="min-h-11 rounded-full bg-primary px-5 py-2 text-sm font-extrabold text-on-primary disabled:cursor-not-allowed disabled:opacity-45">Add</button>
          </div>
        </div>
      </li>)}</ul>
    </> : <>
      {dated && <label className="mt-4 block text-sm font-bold text-primary">Available weeks
        <select aria-label={`${product.name} dates`} value={date} onChange={event => { setChoices([]); onChange({ mode: 'week', date: event.target.value }); }} className="mt-1 w-full rounded-xl border bg-white p-3 sm:max-w-xs">
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
            {meal && dayDate && <HealthyLunchMealOptions groups={meal.optionGroups} date={dayDate} choices={choices} onChange={setChoices} />}
          </div>
        </li>;
      })}</ul>
      {weekOptions.error && <p className="mt-3 text-sm" role="status">Complete required choices for each meal before adding the plan.</p>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">Original Price: {formatRegionCurrency(pricing?.originalPrice ?? 0, currency)} · Discount: {formatRegionCurrency(pricing?.discountAmount ?? 0, currency)} · Final Weekly Price</p>
        <p className="text-lg font-extrabold text-primary">{formatRegionCurrency((Math.round((pricing?.finalWeeklyPrice ?? 0) * 100) + weekOptions.surchargeMinor) / 100, currency)}</p>
        <button type="button" disabled={!canOrder || (dated && !date) || Boolean(weekOptions.error)} onClick={() => onAdd?.({ mode: 'week', date, selectedMealOptions: selected(weekDates) })} className="min-h-12 rounded-full bg-primary px-6 py-3 text-sm font-extrabold text-on-primary disabled:cursor-not-allowed disabled:opacity-45">Add 5-Day Plan</button>
      </div>
    </>}
  </div>;
}
