import { deliveryTimeSlots } from '../../../functions/deliveryTimePolicy.js';
import { formatPickupTimeLabel } from './storeModel';
export default function DeliveryTimeSelect({label,value,onChange,hours,inherit=false}: {label:string;value:string;onChange:(time:string)=>void;hours:{from:string;to:string};inherit?:boolean}) {
 return <label className="mt-2 block text-sm font-bold text-primary">{label}<select aria-label={label} required={!inherit} value={value} onChange={event=>onChange(event.target.value)} className="mt-1 block min-h-12 w-full rounded-xl border border-surface-container-high bg-white px-3 py-2">
  <option value="">{inherit?'Use general delivery time':'Choose a delivery time'}</option>
  {deliveryTimeSlots(hours).map(time=><option key={time} value={time}>{formatPickupTimeLabel(time,'MY')}</option>)}
 </select></label>;
}
