// Local-only component QA fixture. No Firebase, account, provider or live writes.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import HealthyLunchOptionsEditor from '../../src/modules/store/HealthyLunchOptionsEditor';
import HealthyLunchMenu, { type HealthyLunchChoice } from '../../src/modules/store/HealthyLunchMenu';
import HealthyLunchPurchasedOptions from '../../src/modules/store/HealthyLunchPurchasedOptions';
import { getWeeklyDates } from '../../functions/storeWeeklyMealPlan.js';
import type { MealOptionGroup, StoreProduct, StoreOrderItem } from '../../src/modules/store/types';

function App() {
  const [screen,setScreen] = useState('merchant');
  const [groups,setGroups] = useState<MealOptionGroup[]>([]);
  const [choice,setChoice] = useState<HealthyLunchChoice>({ mode:'week',date:'2026-10-19' });
  const [item,setItem] = useState<StoreOrderItem | null>(null);
  const [qty,setQty] = useState(1);
  const [error,setError] = useState('');
  const [snapshot,setSnapshot] = useState('');
  const dates = getWeeklyDates('2026-10-19');
  const meals = Object.fromEntries(['mon','tue','wed','thu','fri'].map(day => [day,{ name:day === 'mon' ? 'Teriyaki Chicken Bowl' : `${({ tue:'Tuesday',wed:'Wednesday',thu:'Thursday',fri:'Friday' } as Record<string,string>)[day]} lunch`, photoUrl:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240"><rect width="400" height="240" fill="#e1eedf"/><circle cx="200" cy="120" r="90" fill="#fff"/><circle cx="200" cy="120" r="70" fill="#b1c981"/><ellipse cx="220" cy="125" rx="48" ry="28" fill="#b77d43"/></svg>'),price:12.9,calories:520, ...(day === 'mon' ? { optionGroups:groups } : day === 'tue' ? { optionGroups:[{ id:'side',name:'Add vegetables',type:'add_side',required:false,selection:'multi',options:[{ id:'broccoli',name:'Broccoli',priceAdjustmentMinor:120 },{ id:'greens',name:'Seasonal Greens',priceAdjustmentMinor:220 }] }] } : {}) }]));
  const product = { id:'qa-plan',storeId:'qa',workspaceId:'qa',name:'Healthy Lunch',price:60,available:true,productType:'weekly_meal_plan',weeklyMenuVersion:3,rotationStartMonday:'2026-10-19',rotationWeeks:{ week1:{ meals } },healthyLunchBlockedDates:[],optionGroupIds:[] } as StoreProduct;
  const add = async (selected: HealthyLunchChoice) => {
    try {
      const day = selected.mode === 'day';
      const response = await fetch('/__healthy_lunch_qa_order', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ id:'qa-order',orderNumber:'LOCAL-QA',products:[product],optionGroups:[],paymentProvider:'stripe',paymentProviderMode:'single_merchant',now:new Date('2026-10-16T04:00:00Z'),
        store:{ id:'qa',workspaceId:'qa',name:'Local QA',country:'MY',currency:'MYR',pickupEnabled:true,orderDays:['monday','tuesday','wednesday','thursday','friday'],maximumAdvanceDays:14,pickupOperatingHours:{ start:'10:00',end:'18:00' },pickupLocations:[{ id:'counter',name:'Counter',address:'QA' }] },
        draft:{ customerName:'QA',phone:'+60123456789',pickupDate:day ? selected.date : '2026-10-19',pickupTime:'10:00',pickupLocationId:'counter',selections:[{ productId:product.id,quantity:qty,selectedOptions:[],selectedMealOptions:selected.selectedMealOptions || [],...(day ? { healthyLunchPlanId:product.id,healthyLunchDate:selected.date } : {}) }],...(!day ? { fulfilments:dates.map(date => ({ date,time:'10:00',itemIndexes:[0] })) } : {}) }
      }) });
      const order = await response.json();
      if (!response.ok) throw new Error(order.error);
      setItem(order.items[0]);setSnapshot(JSON.stringify(order.items[0]));setError('');
    } catch (error) { setError((error as Error).message); }
  };
  return <main className="mx-auto max-w-7xl space-y-5 p-6 text-primary"><h1 className="text-2xl font-extrabold">Healthy Lunch · Phase 1 local QA</h1><p className="text-sm">Actual merchant/customer components and server order builder · disposable local data</p>
    <nav className="flex gap-3"><button className="rounded-full border px-4 py-2" onClick={() => setScreen('merchant')}>Merchant editor</button><button className="rounded-full border px-4 py-2" onClick={() => setScreen('customer')}>Customer selection</button></nav>
    {screen === 'merchant' ? <section className="max-w-3xl"><h2 className="mb-3 text-xl font-bold">Week 1 · Monday · Teriyaki Chicken Bowl</h2><HealthyLunchOptionsEditor groups={groups} onChange={setGroups} /><details className="mt-3"><summary>Saved IDs</summary><pre className="text-xs">{JSON.stringify(groups.map(group => ({ id:group.id,options:group.options.map(option => option.id) })),null,2)}</pre></details></section> : <section><label>Quantity <select aria-label="Quantity" value={qty} onChange={event => setQty(Number(event.target.value))} className="rounded-lg border p-2"><option value={1}>1</option><option value={2}>2</option></select></label><HealthyLunchMenu product={product} products={[product]} currency="MYR" weeks={['2026-10-19']} dayDates={dates} choice={choice} onChange={setChoice} onAdd={add} />
      {error && <p role="alert">{error}</p>}{item && <aside className="mt-4 rounded-xl border bg-white p-4" aria-label="Purchased server snapshot"><h2 className="font-bold">Server snapshot · {item.quantity} × {item.productName} · RM{item.lineTotal.toFixed(2)}</h2><HealthyLunchPurchasedOptions item={item} /><details><summary>Immutable snapshot JSON</summary><pre className="overflow-auto text-xs">{snapshot}</pre></details></aside>}
    </section>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
