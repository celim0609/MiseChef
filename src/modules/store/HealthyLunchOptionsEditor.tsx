import { parseMealOptionPrice } from '../../../functions/healthyLunchOptions.js';
import type { MealOptionGroup } from './types';

export default function HealthyLunchOptionsEditor({ groups = [], onChange }: { groups?: MealOptionGroup[]; onChange: (groups: MealOptionGroup[]) => void }) {
  const patch = (id: string, values: Partial<MealOptionGroup>) => onChange(groups.map(group => group.id === id ? { ...group, ...values } : group));
  return <div className="space-y-3 rounded-xl border p-3"><p className="font-bold">Meal options</p>
    {groups.map((group, index) => <fieldset key={group.id} className="space-y-2 rounded-xl border bg-white p-3"><legend className="text-sm font-bold">Option group {index + 1}</legend>
      <label className="block text-sm">Group name<input aria-label={`Group ${index + 1} name`} required maxLength={160} value={group.name} onChange={event => patch(group.id, { name: event.target.value })} className="block w-full rounded-lg border p-2" /></label>
      <div className="flex flex-wrap gap-3"><label>Type<select value={group.type} onChange={event => patch(group.id, { type: event.target.value as MealOptionGroup['type'] })} className="ml-2 rounded-lg border p-2"><option value="choose">Choose</option><option value="add_side">Add Side</option><option value="exchange">Exchange</option></select></label>
        <label>Selection<select value={group.selection} onChange={event => patch(group.id, { selection: event.target.value as MealOptionGroup['selection'] })} className="ml-2 rounded-lg border p-2"><option value="single">Single</option><option value="multi">Multiple</option></select></label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={group.required} onChange={event => patch(group.id, { required: event.target.checked })} />Required</label></div>
      {group.options.map((option, optionIndex) => <div key={option.id} className="flex flex-wrap items-end gap-2">
        <label className="min-w-40 flex-1 text-sm">Option name<input aria-label={`Group ${index + 1} option ${optionIndex + 1} name`} required maxLength={160} value={option.name} onChange={event => patch(group.id, { options: group.options.map(item => item.id === option.id ? { ...item, name: event.target.value } : item) })} className="block w-full rounded-lg border p-2" /></label>
        <label className="text-sm">Price adjustment (RM)<input aria-label={`Group ${index + 1} option ${optionIndex + 1} price`} required type="number" min="0" max="100000" step="0.01" value={Number.isFinite(option.priceAdjustmentMinor) ? option.priceAdjustmentMinor / 100 : ''} onChange={event => patch(group.id, { options: group.options.map(item => item.id === option.id ? { ...item, priceAdjustmentMinor: parseMealOptionPrice(event.target.value) } : item) })} className="block w-28 rounded-lg border p-2" /></label>
        <button type="button" onClick={() => patch(group.id, { options: group.options.filter(item => item.id !== option.id) })} className="rounded-lg border p-2 text-sm">Delete option</button>
      </div>)}
      <div className="flex gap-2"><button type="button" onClick={() => patch(group.id, { options: [...group.options, { id: crypto.randomUUID(), name: '', priceAdjustmentMinor: 0 }] })} className="rounded-lg border p-2 text-sm">Add option</button><button type="button" onClick={() => onChange(groups.filter(item => item.id !== group.id))} className="rounded-lg border p-2 text-sm">Delete group</button></div>
    </fieldset>)}
    <button type="button" onClick={() => onChange([...groups, { id: crypto.randomUUID(), name: '', type: 'choose', required: false, selection: 'single', options: [{ id: crypto.randomUUID(), name: '', priceAdjustmentMinor: 0 }] }])} className="rounded-full border px-4 py-2 text-sm font-bold">Add option group</button>
  </div>;
}
