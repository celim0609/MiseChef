import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import CompactDeliverySchedule from './CompactDeliverySchedule';
const days=['2026-11-30','2026-12-01','2026-12-02','2026-12-03','2026-12-04'].map((date,index)=>({date,mealName:`Meal ${index+1}`,time:index===4?'12:00':'11:00',timeOverride:index===4,addressOverride:index===4,address:index===4?'School gate':'General delivery address',addressReady:true}));
test('all five resolved times and meal/address summaries remain visible with controls collapsed',()=>{
 const html=renderToStaticMarkup(<CompactDeliverySchedule days={days} renderEditor={()=> <input aria-label="Hidden editor"/>}/>);
 for(const day of days){assert.ok(html.includes(day.mealName));assert.ok(html.includes(day.date));}
 assert.equal((html.match(/11:00 AM/g)||[]).length,4);assert.match(html,/12:00 PM/);assert.match(html,/School gate/);assert.match(html,/Time override/);assert.match(html,/Address override/);
 assert.equal((html.match(/aria-expanded="false"/g)||[]).length,5);assert.doesNotMatch(html,/Hidden editor|Use general delivery time|<select/);
});
test('missing address is explicit and never presented as ready',()=>{
 const html=renderToStaticMarkup(<CompactDeliverySchedule days={[{...days[0],addressReady:false,address:undefined}]} renderEditor={()=>null}/>);assert.match(html,/Delivery address needed/);
});
test('checkout renders one multi-date general selector and keeps the payment footer in normal flow',()=>{
 const page=readFileSync(new URL('./PublicStorePage.tsx',import.meta.url),'utf8');
 assert.equal((page.match(/label="General delivery time — applies to all dates"/g)||[]).length,1);
 assert.match(page,/value=\{finalDeliveryTime\(deliverySelection,date\)\}/);
 assert.match(page,/renderEditor=\{date/);assert.match(page,/resetKey=\{`\$\{isCheckoutOpen\}/);
 assert.doesNotMatch(page,/sticky bottom-3|gap-5 pb-28/);
 assert.match(page,/env\(safe-area-inset-bottom\)/);
});
