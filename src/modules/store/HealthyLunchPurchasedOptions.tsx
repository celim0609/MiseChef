import { getWeeklyDates } from '../../../functions/storeWeeklyMealPlan.js';
import MealOptionSummary from './MealOptionSummary';
import type { StoreOrderItem } from './types';

export default function HealthyLunchPurchasedOptions({ item }: { item: StoreOrderItem }) {
  if (item.healthyLunchSnapshot?.selectedMealOptions?.length) return <div className="mt-2 text-sm"><p>{item.healthyLunchSnapshot.date}</p><MealOptionSummary snapshot={item.healthyLunchSnapshot} /></div>;
  if (!item.weeklyPlanSnapshot?.meals.some(meal => meal.selectedMealOptions?.length)) return null;
  return <div className="mt-2 space-y-2 text-sm">{item.weeklyPlanSnapshot.meals.map((meal, index) => <div key={meal.day}><p className="font-bold">{meal.serviceDate || getWeeklyDates(item.weeklyPlanSnapshot?.startMonday)[index] || meal.day.toUpperCase()} · {meal.productName}</p><MealOptionSummary snapshot={meal} /></div>)}</div>;
}
