import type { MealOptionChoice, MealOptionGroup } from './types';

export default function HealthyLunchMealOptions({ groups = [], date, choices, onChange }: { groups?: MealOptionGroup[]; date: string; choices: MealOptionChoice[]; onChange: (choices: MealOptionChoice[]) => void }) {
  return <div className="mt-3 space-y-3">{groups.map(group => <fieldset key={group.id} className="space-y-2 border-t pt-2"><legend className="text-sm font-bold">{group.name} <span className="text-xs font-normal">{group.required ? 'Required' : 'Optional'} · {group.selection === 'single' ? 'Choose one' : 'Choose multiple'} · {({ choose: 'Choose', add_side: 'Add Side', exchange: 'Exchange' })[group.type]}</span></legend>
    {group.options.filter(option => option.active !== false).map(option => <label key={option.id} className="flex cursor-pointer items-start gap-2 text-sm">
      <input type={group.selection === 'single' ? 'radio' : 'checkbox'} name={`${date}-${group.id}`} checked={choices.some(choice => choice.serviceDate === date && choice.optionGroupId === group.id && choice.optionId === option.id)} onChange={event => {
        const rest = choices.filter(choice => !(choice.serviceDate === date && choice.optionGroupId === group.id && (group.selection === 'single' || choice.optionId === option.id)));
        onChange(event.target.checked ? [...rest, { serviceDate: date, optionGroupId: group.id, optionId: option.id }] : rest);
      }} className="mt-1 shrink-0" /><span>{option.name} <span className="whitespace-nowrap font-bold">+RM{(option.priceAdjustmentMinor / 100).toFixed(2)}</span></span>
    </label>)}
    {!group.required && group.selection === 'single' && <button type="button" onClick={() => onChange(choices.filter(choice => choice.serviceDate !== date || choice.optionGroupId !== group.id))} className="text-xs underline">Clear choice</button>}
  </fieldset>)}</div>;
}
