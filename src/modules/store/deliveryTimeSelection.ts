import type { DeliveryDestination } from './services/deliveryService';
export interface DeliveryDaySelection { time?: string; destination?: DeliveryDestination }
export interface DeliveryTimeSelection {
  generalTime: string;
  days: Record<string, DeliveryDaySelection>;
  pendingOverrides: Record<string, DeliveryDaySelection>;
  overridesConfirmed: boolean;
}
export const emptyDeliveryTimeSelection = (): DeliveryTimeSelection => ({generalTime:'',days:{},pendingOverrides:{},overridesConfirmed:false});
type Action = {type:'reset'} | {type:'general';time:string} | {type:'day';date:string;time:string} | {type:'destination';date:string;destination:DeliveryDestination} | {type:'confirm';confirmed:boolean} | {type:'preserve'};
export function deliveryTimeSelectionReducer(state: DeliveryTimeSelection, action: Action): DeliveryTimeSelection {
  if(action.type==='reset') return emptyDeliveryTimeSelection();
  if(action.type==='general') return {...state,generalTime:action.time,days:Object.fromEntries(Object.entries(state.days).map(([date,{time:_,...day}])=>[date,day])),pendingOverrides:Object.fromEntries(Object.entries(state.days).filter(([,day])=>Boolean(day.time && day.time!==action.time))),overridesConfirmed:false};
  if(action.type==='day') return {...state,days:{...state.days,[action.date]:{...state.days[action.date],time:action.time}},overridesConfirmed:false,pendingOverrides:{}};
  if(action.type==='destination') return {...state,days:{...state.days,[action.date]:{...state.days[action.date],destination:action.destination}}};
  if(action.type==='confirm') return {...state,overridesConfirmed:action.confirmed};
  return {...state,days:Object.fromEntries([...new Set([...Object.keys(state.days),...Object.keys(state.pendingOverrides)])].map(date=>[date,{...state.days[date],...(state.pendingOverrides[date]?.time?{time:state.pendingOverrides[date].time}:{})}])),pendingOverrides:{},overridesConfirmed:true};
}
export const finalDeliveryTime = (state: DeliveryTimeSelection,date:string) => state.days[date]?.time || state.generalTime;
export const hasDeliveryOverrides = (state: DeliveryTimeSelection,dates:string[]) => dates.some(date=>Boolean(state.days[date]?.time && state.days[date].time!==state.generalTime));
