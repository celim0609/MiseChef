import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { browserRange } from './orderBrowserModel';
import { shiftDateKey } from './posOrderModel';

export default function UpcomingDateSelector({value, today, onChange, night = false}: {
  value: string; today: string; onChange: (date: string) => void; night?: boolean;
}) {
  const minimum = shiftDateKey(today, 1);
  const start = browserRange(value, 'Week').start;
  const surface = night ? 'border-slate-600 bg-slate-800 text-slate-100' : 'border-slate-300 bg-white text-slate-900';
  const moveWeek = (direction: number) => onChange([minimum, shiftDateKey(value, direction * 7)].sort().at(-1)!);
  return <section aria-label="Upcoming fulfilment date" className="mb-3 max-w-xl space-y-2">
    <div className="flex items-center gap-2">
      <button type="button" aria-label="Previous week" disabled={shiftDateKey(start, -1) < minimum} onClick={() => moveWeek(-1)} className={`flex min-h-11 w-11 items-center justify-center rounded-lg border disabled:opacity-35 ${surface}`}><ChevronLeft size={18} /></button>
      <label className={`flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border px-2 ${surface}`}><CalendarDays size={18} /><span className="sr-only">Select upcoming date</span><input type="date" aria-label="Select upcoming date" min={minimum} value={value} onChange={event => {if (event.target.value >= minimum) onChange(event.target.value);}} className="min-w-0 bg-transparent text-sm font-bold" /></label>
      <button type="button" aria-label="Next week" onClick={() => moveWeek(1)} className={`flex min-h-11 w-11 items-center justify-center rounded-lg border ${surface}`}><ChevronRight size={18} /></button>
    </div>
    <div className="grid grid-cols-7 gap-1" aria-label="Monday to Sunday">
      {Array.from({length: 7}, (_, index) => {
        const date = shiftDateKey(start, index);
        const label = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {day:'numeric', month:'short', timeZone:'UTC'});
        return <button type="button" key={date} disabled={date < minimum} aria-pressed={date === value} aria-label={`${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][index]}, ${date}`} onClick={() => onChange(date)} className={`min-h-11 rounded-lg border py-1 text-center disabled:opacity-35 ${date === value ? 'border-blue-600 bg-blue-600 text-white' : surface}`}><span className="block text-xs font-bold">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][index]}</span><span className="block whitespace-nowrap text-[10px] sm:text-xs">{label}</span></button>;
      })}
    </div>
  </section>;
}
