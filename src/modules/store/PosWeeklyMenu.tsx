import {useState, type ReactNode} from 'react';
import HealthyLunchMenu, {type HealthyLunchChoice} from './HealthyLunchMenu';
import {getValidPickupDates,getPickupTimeSlots} from './storeModel';
import {weekRangeLabel,datedWeeks,fullWeekDateStore,getWeeklyDates,getWeeklyPickupTimes,hasDatedMenu,isDatedWeekOpen,isHealthyLunchWeekBlocked,validateWeeklyMealPlan,resolveHealthyLunchDay,hasEmbeddedMenu,validCalendarDate} from '../../../functions/storeWeeklyMealPlan.js';
import {posStoreDate, resolvePosAddOrderMeal} from '../../../functions/posWeeklyDay.js';
import {posInitialItemDate} from './posOrderEntryModel';
import type {StoreProduct,WorkspaceStore} from './types';

export default function PosWeeklyMenu({product,products,store,onAdd,disabled=false,exactTime=false,unrestricted=false,cartFeedback,defaultDate='',defaultTime=''}:{product:StoreProduct;products:StoreProduct[];store:WorkspaceStore;onAdd:(choice:HealthyLunchChoice,time:string)=>void;disabled?:boolean;exactTime?:boolean;unrestricted?:boolean;cartFeedback?:ReactNode;defaultDate?:string;defaultTime?:string}) {
 const [choice,setChoice]=useState<HealthyLunchChoice>({mode:'week',date:''});
 const [time,setTime]=useState('');
 const [serviceDate,setServiceDate]=useState<string>();
 const [customDate,setCustomDate]=useState(false);
 const [menuDate,setMenuDate]=useState<string>();
 const today=unrestricted ? posStoreDate(store) : '';
 const selectedDay=serviceDate ?? (defaultDate || today);
 const dayAccess=unrestricted && choice.mode==='day';
 const selectedMenuDate=customDate ? menuDate ?? today : selectedDay;
 const selectedMeal=dayAccess ? resolvePosAddOrderMeal(product,products,selectedMenuDate,selectedDay,today) : null;
 if (unrestricted) { product={...product,healthyLunchBlockedDates:[]}; products=products.map(p=>({...p,healthyLunchBlockedDates:[]})); }
 const requestedDate=choice.date || posInitialItemDate(product,defaultDate);
 const dates=getValidPickupDates(fullWeekDateStore(store,product));
 const weeks=[...new Set((product.weeklyWeeks!==undefined?datedWeeks(product).map(week=>week.startMonday):[...(unrestricted && getWeeklyDates(requestedDate).length===5 ? [requestedDate] : []),...dates.filter(date=>getWeeklyDates(date).length===5)])
  .filter(date=>!validateWeeklyMealPlan(product,products,store.id,date)&&(unrestricted||((!hasDatedMenu(product)||isDatedWeekOpen(store,date))&&!isHealthyLunchWeekBlocked(product,date)&&getWeeklyPickupTimes(fullWeekDateStore(store,product),date,getValidPickupDates,getPickupTimeSlots,new Date(),product).length))))];
 const monday=weeks.includes(requestedDate)?requestedDate:weeks[0]||'';
 const catalogDates=product.weeklyWeeks!==undefined
  ? datedWeeks(product).flatMap(week=>getWeeklyDates(week.startMonday))
  : getWeeklyDates(monday);
 const dayDates=hasDatedMenu(product)
  ? (unrestricted ? catalogDates : getValidPickupDates(store)).filter(date=>Boolean(resolveHealthyLunchDay(product,products,date)))
  : [];
 const times=choice.mode==='week'?getWeeklyPickupTimes(fullWeekDateStore(store,product),monday,getValidPickupDates,getPickupTimeSlots,new Date(),product):getPickupTimeSlots(store,dayDates[0]||'');
 const selectedTime=exactTime ? time || defaultTime || (unrestricted ? '12:00' : times[0]) || '' : times.includes(time)?time:times[0]||'';
 return <section className="rounded-xl border bg-white p-3">
  <h3 className="mb-2 font-bold">{product.name}</h3>
  {unrestricted && !dayAccess && <label className="block text-sm font-bold">Week starting (Monday)<input type="date" value={requestedDate} onChange={event=>setChoice({...choice,date:event.target.value})} className="ml-2 rounded border p-2" /></label>}
  {dayAccess && <div className="space-y-1">
    <label className="block text-sm font-bold">Date mode
      <select value={customDate ? 'custom' : 'weekly'} onChange={event=>setCustomDate(event.target.value==='custom')} className="ml-2 rounded border p-2">
        <option value="weekly">Follow Weekly Menu</option><option value="custom">Custom Date</option>
      </select>
    </label>
    {customDate && product.weeklyMenuVersion === 2 && <label className="block text-sm font-bold">Configured menu meal
      <select aria-label={`${product.name} menu source`} value={selectedMenuDate} onChange={event=>setMenuDate(event.target.value)} className="ml-2 rounded border p-2">
        <option value="">Choose menu meal</option>
        {catalogDates.filter(date=>Boolean(resolveHealthyLunchDay(product,products,date))).map(date=><option key={date} value={date}>{date} · {resolveHealthyLunchDay(product,products,date)?.name}</option>)}
      </select>
    </label>}
    {customDate && <label className="block text-sm font-bold">Menu meal date
      <input type="date" value={selectedMenuDate} onChange={event=>setMenuDate(event.target.value)} className="ml-2 rounded border p-2" />
    </label>}
    {customDate && product.weeklyMenuVersion === 3 && <p className="text-sm">Meal and price use the retained menu configuration. Menu meal date selects the dish; Service date sets fulfilment. Past fulfilment requires a dated historical menu.</p>}
    <label className="block text-sm font-bold">Service date<input type="date" value={selectedDay} onChange={event=>setServiceDate(event.target.value)} className="ml-2 rounded border p-2" /></label>
    {selectedMeal?.monday && <p className="text-sm">{customDate ? 'Menu week starting' : 'Week starting'} {selectedMeal.monday}</p>}
    {selectedMeal?.error && <p role="status" className="text-sm">{selectedMeal.error}</p>}
  </div>}
  {!hasDatedMenu(product) && <label className="mb-2 block text-sm font-bold">Week starting<select aria-label={`${product.name} week`} value={monday} onChange={event=>setChoice({...choice,date:event.target.value})} className="ml-2 rounded border p-2">{!weeks.length&&<option value="">No available dates</option>}{weeks.map(date=><option key={date} value={date}>{weekRangeLabel(date)}</option>)}</select></label>}
  <label className="text-sm font-bold">Fulfilment time<>{exactTime ? <input type="time" aria-label={`${product.name} fulfilment time`} value={selectedTime} onChange={event=>setTime(event.target.value)} className="ml-2 rounded-lg border p-2" /> : <select aria-label={`${product.name} fulfilment time`} value={selectedTime} onChange={event=>setTime(event.target.value)} className="ml-2 rounded-lg border p-2">{!times.length&&<option value="">No available times</option>}{times.map(time=><option key={time}>{time}</option>)}</select>}</></label>
  <HealthyLunchMenu product={product} products={products} currency={store.currency} weeks={weeks} dayDates={dayAccess ? selectedMeal?.meal ? [selectedMenuDate] : [] : dayDates} choice={{...choice,date:monday}} monday={monday} canOrder={Boolean(selectedTime)&&!disabled&&(!dayAccess||validCalendarDate(selectedDay))} dayUnavailable={dayAccess && Boolean(selectedMeal?.error)} onChange={setChoice} onAdd={choice=>onAdd(dayAccess ? {...choice,fulfilmentDate:selectedDay} : choice,selectedTime)}/>
  {cartFeedback}
  {!hasEmbeddedMenu(product)&&!weeks.length&&<p>No available menu dates. Review Store configuration.</p>}
 </section>;
}
