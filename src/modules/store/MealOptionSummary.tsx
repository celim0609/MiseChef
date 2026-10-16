import type { MealOptionSnapshot } from './types';

export default function MealOptionSummary({ snapshot }: { snapshot?: MealOptionSnapshot }) {
  if (!snapshot?.selectedMealOptions?.length) return null;
  return <ul className="mt-1 space-y-1 text-sm font-normal">{snapshot.selectedMealOptions.map(option => <li key={`${option.optionGroupId}-${option.optionId}`}>{option.optionGroupName}: {option.optionName} <span className="whitespace-nowrap">+RM{(option.priceAdjustmentMinor / 100).toFixed(2)}</span></li>)}</ul>;
}
