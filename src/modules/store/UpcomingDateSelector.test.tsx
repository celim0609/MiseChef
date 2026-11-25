import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import UpcomingDateSelector from './UpcomingDateSelector';
import {dailyEntries, ticketInDailyView} from './dailyOrderModel';
import {browserRange} from './orderBrowserModel';
import type {StoreOrder} from './types';
const dates = ['2026-11-26','2026-11-27','2026-12-02','2026-11-30','2026-12-01','2027-01-01'];
const order = {id:'weekly',createdAt:'2025-01-01',pickupDate:'2026-11-26',fulfilmentStatus:'New',payment:{status:'paid'},items:[{productName:'Weekly Menu',quantity:1,selectedOptions:[],weeklyPlanSnapshot:{meals:[{day:'mon',productName:'Monday meal'},{day:'tue',productName:'Tuesday meal'}]}}],fulfilments:dates.map((date,index)=>({id:`day-${index}`,date,time:'12:00',method:index%2?'delivery':'pickup',allocations:[{itemIndex:0,quantity:1,componentDay:index%2?'tue':'mon'}]}))} as StoreOrder;
test('Upcoming isolates tomorrow, day after, next week, month and year boundaries by actual daily fulfilment',()=>{
 const original=JSON.stringify(order);
 for(const date of dates){
  const entries=dailyEntries([order],'Upcoming','2026-11-25',date);
  assert.equal(entries.length,1);
  assert.equal(entries[0].ticket.date,date);
  assert.equal(entries[0].ticket.method,dates.indexOf(date)%2?'delivery':'pickup');
  assert.equal(entries[0].ticket.items[0].name,dates.indexOf(date)%2?'Tuesday meal':'Monday meal');
 }
 assert.deepEqual(dailyEntries([order],'Upcoming','2026-11-25','2026-12-03'),[]);
 assert.equal(JSON.stringify(order),original);
});
test('Upcoming preserves terminal status and Today/History date rules',()=>{
 assert.deepEqual(dailyEntries([{...order,fulfilmentStatus:'Cancelled'}],'Upcoming','2026-11-25',dates[0]),[]);
 assert.equal(ticketInDailyView('2026-11-25','Today','2026-11-25',dates[0]),true);
 assert.equal(ticketInDailyView('2026-11-24','History','2026-11-25',dates[0]),true);
 assert.equal(ticketInDailyView('2026-11-25','Upcoming','2026-11-25','2026-11-25'),false);
});
test('selector renders Monday through Sunday, future-only calendar and selected highlight across month boundary',()=>{
 const html=renderToStaticMarkup(<UpcomingDateSelector value="2026-12-01" today="2026-11-25" onChange={()=>{}} />);
 assert.equal((html.match(/aria-pressed="true"/g)||[]).length,1);
 for(const label of ['Monday, 2026-11-30','Tuesday, 2026-12-01','Sunday, 2026-12-06','Previous week','Next week','min="2026-11-26"']) assert.ok(html.includes(label),label);
 assert.deepEqual(browserRange('2026-12-01','Week'),{start:'2026-11-30',end:'2026-12-07'});
});
test('week navigation, date selection and calendar input update the selected future day',()=>{
 const selected:string[]=[];
 const tree=UpcomingDateSelector({value:'2026-12-01',today:'2026-11-25',onChange:date=>selected.push(date)});
 const nodes:any[]=[];
 function visit(node:any){if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(visit);return;}nodes.push(node);visit(node.props?.children);}
 visit(tree);
 nodes.find(node=>node.props?.['aria-label']==='Next week').props.onClick();
 nodes.find(node=>node.props?.['aria-label']==='Previous week').props.onClick();
 nodes.find(node=>node.props?.['aria-label']==='Friday, 2026-12-04').props.onClick();
 const input=nodes.find(node=>node.type==='input');
 input.props.onChange({target:{value:'2027-01-01'}});
 input.props.onChange({target:{value:'2026-11-25'}});
 input.props.onChange({target:{value:''}});
 assert.deepEqual(selected,['2026-12-08','2026-11-26','2026-12-04','2027-01-01']);
 const first=renderToStaticMarkup(<UpcomingDateSelector value="2026-11-26" today="2026-11-25" onChange={()=>{}} />);
 assert.match(first,/aria-label="Previous week" disabled/);
});
