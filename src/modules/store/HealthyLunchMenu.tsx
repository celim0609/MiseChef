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
  sharedSelection?: boolean;
  sharedUnavailable?: boolean;
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

export default function HealthyLunchMenu({ sharedSelection = false, sharedUnavailable = false, product, products, currency, weeks, dayDates, choice, monday = '', canOrder = true, onChange, onAdd }: Props) {
  const [choices, setChoices] = useState<MealOptionChoice[]>([]);
  const dated = hasDatedMenu(product);
  const date = weeks.includes(choice.date) ? choice.date : (sharedSelection ? '' : weeks[0]) || '';
  const selectedMonday = dated ? date : monday || date;
  const showDays = dated && choice.mode === 'day';
  const dailyMeals = [...new Set(dayDates)].filter(date => !sharedSelection || date === choice.date).sort().flatMap(date => {
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
  return <div className="mt-3 min-w-0 rounded-2xl bg-surface-container-low p-3 sm:p-4">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      {dated ? <div className="inline-flex w-fit max-w-full rounded-xl border border-surface-container-high bg-white p-1" role="group" aria-label={`${product.name} ordering`}>
        <button type="button" aria-pressed={!showDays} onClick={() => onChange({ mode: 'week', date })} className="min-h-10 rounded-lg px-3 py-2 text-sm font-bold text-primary aria-pressed:bg-primary aria-pressed:text-on-primary sm:px-4">5-Day Plan</button>
        <button type="button" aria-pressed={showDays} onClick={() => onChange({ mode: 'day', date })} className="min-h-10 rounded-lg px-3 py-2 text-sm font-bold text-primary aria-pressed:bg-primary aria-pressed:text-on-primary sm:px-4">Order by Day</button>
      </div> : <p className="text-sm font-extrabold text-primary">5-Day Plan · Mon–Fri</p>}
      {dated && !showDays && <label className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-bold text-on-surface-variant">Available weeks
        <select aria-label={`${product.name} dates`} value={date} onChange={event => { setChoices([]); onChange({ mode: 'week', date: event.target.value }); }} className="min-h-10 min-w-0 flex-1 rounded-lg border border-surface-container-high bg-white px-3 py-2 text-sm text-primary lg:w-44 lg:flex-none">
          {!weeks.length && <option value="">No available dates</option>}{weeks.map(date => <option key={date} value={date}>{weekRangeLabel(date)}</option>)}
        </select>
      </label>}
    </div>

    {sharedSelection && (sharedUnavailable || !choice.date) && <p role="status" className="mt-3 text-sm">This shared menu is not currently available to order.</p>}
    {showDays ? <>
      {!dailyMeals.length && <p className="mt-4 text-sm text-on-surface-variant">No meals are currently available to order.</p>}
      <ul className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-5">{dailyMeals.map(({ date, meal }) => <li key={date} className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-surface-container-high bg-white shadow-sm">
        <div className="aspect-[4/3] overflow-hidden bg-surface-container">{meal.photoUrl && <img src={meal.photoUrl} alt={meal.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" loading="lazy" />}</div>
        <div className="flex flex-1 flex-col gap-2 p-3">
          <time dateTime={date} className="text-xs font-extrabold text-secondary">{dateLabel(date)}</time>
          <h5 className="min-h-10 break-words text-sm font-extrabold leading-5 text-primary">{meal.name}</h5>
          {meal.calories !== undefined && <p className="text-xs text-on-surface-variant">{meal.calories} kcal</p>}
          <MealIngredients description={meal.description} />
          <MealChoices groups={meal.optionGroups} date={date} choices={choices} onChange={setChoices} />
          {optionState([date]).error && <p className="text-xs" role="status">Complete required choices to add this meal.</p>}
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-surface-container-high pt-3">
            <p className="text-sm font-extrabold text-primary">{formatRegionCurrency((Math.round(meal.price * 100) + optionState([date]).surchargeMinor) / 100, currency)}</p>
            <button type="button" aria-label={`Add ${meal.name}`} disabled={!canOrder || Boolean(optionState([date]).error)} onClick={() => onAdd?.({ mode: 'day', date, selectedMealOptions: selected([date]) })} className="min-h-11 shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-extrabold text-on-primary disabled:cursor-not-allowed disabled:opacity-45">Add</button>
          </div>
        </div>
      </li>)}</ul>
    </> : <>
      <ul className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-5">{WEEKLY_DAYS.filter(() => !dated || Boolean(date)).map((day, index) => {
        const meal = resolvePlanMeal(product, products, selectedMonday, day);
        const dayDate = getWeeklyDates(selectedMonday)[index];
        return <li key={day} className="row-span-5 grid min-w-0 grid-rows-subgrid gap-0 overflow-hidden rounded-xl border border-surface-container-high bg-white shadow-sm">
          <div className="aspect-[4/3] overflow-hidden bg-surface-container">{meal?.photoUrl && <img src={meal.photoUrl} alt={meal.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" loading="lazy" />}</div>
          <div className="min-w-0 px-3 pt-3">
            <p className="text-xs font-extrabold text-secondary">{dayDate ? dateLabel(dayDate) : day.toUpperCase()}</p>
            <h5 className="mt-1 break-words text-sm font-extrabold leading-5 text-primary">{meal?.name || 'Meal unavailable'}</h5>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3 pb-2 pt-2 text-xs">
            {meal?.calories !== undefined && <p className="text-on-surface-variant">{meal.calories} kcal</p>}
            {meal && <p className="font-bold text-primary">{formatRegionCurrency(meal.price, currency)} <span className="font-normal text-on-surface-variant">/ day</span></p>}
          </div>
          <div className="min-w-0 px-3 pb-2"><MealIngredients description={meal?.description} /></div>
          <div className="min-w-0 px-3 pb-3">{meal && dayDate && <MealChoices groups={meal.optionGroups} date={dayDate} choices={choices} onChange={setChoices} />}</div>
        </li>;
      })}</ul>
      {weekOptions.error && <p className="mt-3 text-sm" role="status">Complete required choices for each meal before adding the plan.</p>}
      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-surface-container-high bg-white p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-4">
        <dl aria-label="Weekly pricing" className="grid min-w-0 flex-1 grid-cols-3 gap-2 sm:gap-4">
          <div><dt className="text-xs text-on-surface-variant">Original Price</dt><dd className="mt-1 text-sm font-bold text-on-surface-variant">{formatRegionCurrency(pricing?.originalPrice ?? 0, currency)}</dd></div>
          <div><dt className="text-xs text-on-surface-variant">Discount</dt><dd className="mt-1 text-sm font-bold text-secondary">{formatRegionCurrency(pricing?.discountAmount ?? 0, currency)}</dd></div>
          <div><dt className="text-xs font-bold text-primary">Final Weekly Price</dt><dd className="mt-1 text-lg font-extrabold leading-tight text-primary">{formatRegionCurrency((Math.round((pricing?.finalWeeklyPrice ?? 0) * 100) + weekOptions.surchargeMinor) / 100, currency)}</dd></div>
        </dl>
        <button type="button" disabled={!canOrder || (dated && !date) || Boolean(weekOptions.error)} onClick={() => onAdd?.({ mode: 'week', date, selectedMealOptions: selected(weekDates) })} className="min-h-12 w-full shrink-0 rounded-xl bg-primary px-5 py-3 text-sm font-extrabold text-on-primary disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto">Add 5-Day Plan</button>
      </div>
      {weekOptions.surchargeMinor > 0 && <p className="mt-2 text-xs text-on-surface-variant">Final price includes selected meal options: {formatRegionCurrency(weekOptions.surchargeMinor / 100, currency)}.</p>}
    </>}
  </div>;
}

function MealIngredients({ description }: { description?: string }) {
  return description ? <details className="min-w-0 text-xs text-on-surface-variant">
    <summary className="min-h-8 cursor-pointer py-1.5 font-bold text-primary">View Ingredients</summary>
    <p className="break-words whitespace-pre-line pb-1 leading-relaxed">{description}</p>
  </details> : null;
}

function MealChoices({ groups, ...props }: Parameters<typeof HealthyLunchMealOptions>[0]) {
  return groups?.length ? <details open={groups.some(group => group.required)} className="min-w-0 break-words text-xs text-primary">
    <summary className="min-h-8 cursor-pointer py-1.5 font-bold">Options &amp; exchanges</summary>
    <HealthyLunchMealOptions groups={groups} {...props} />
  </details> : null;
}
