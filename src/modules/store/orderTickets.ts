import { officialTicketLogo as officialLogo } from "./officialTicketLogo";
import { validCalendarDate } from '../../../functions/storeWeeklyMealPlan.js';
import { legacyDailyFulfilments } from '../../../functions/legacyDailyFulfilments.js';
import QRCode from 'qrcode';
import type { MealOptionSnapshot, StoreOrder, StoreOrderItem } from './types';
import { toMalaysiaDateKey } from './posOrderModel';

export interface OrderTicket {
  key: string; orderId: string; fulfilmentId?: string; weeklyDay?: string;
  storeName: string; orderNumber: string; pickupCode: string; customerName: string;
  date: string; time: string; method: string; notes: string; paid?: boolean; source?: string;
  items: Array<{ name: string; quantity: number; modifiers: string[] }>;
}
const mealOptions = (snapshot?: MealOptionSnapshot) => (snapshot?.selectedMealOptions || []).map(option => `${option.optionGroupName}: ${option.optionName}`);
const ticketItem = (item: StoreOrderItem, quantity = item.quantity) => ({
  name: item.productName, quantity,
  modifiers: [...(item.selectedOptions || []).map(option => `${option.groupName}: ${option.optionName}${(option.quantity || 1) > 1 ? ` ×${option.quantity}` : ''}`),
    ...(item.setSnapshot?.selectedGroups || []).map(group => `${group.groupName}: ${group.productName}`), ...mealOptions(item.healthyLunchSnapshot), ...(item.notes ? [`Notes: ${item.notes}`] : [])]
});
// Explicit projection: financial and provider fields never enter the print document.
export function getOrderTickets(order: StoreOrder): OrderTicket[] {
  const base = { orderId: order.id, storeName: order.storeName, orderNumber: order.orderNumber, pickupCode: order.pickupCode || '', customerName: order.customerName, notes: order.notes || '', source: ({whatsapp:'WhatsApp',phone:'Phone',walk_in:'Walk-in',shopeefood:'ShopeeFood',other:'Other'} as Record<string,string>)[order.externalOrder?.source || ''] || 'Online Store', paid: order.payment?.status === 'paid' };
  if (order.fulfilments?.some(day => !validCalendarDate(day.date) || !day.allocations?.length || day.allocations.some(allocation => !Number.isInteger(allocation.itemIndex) || !order.items[allocation.itemIndex] || !(allocation.quantity > 0) || (allocation.componentDay && !order.items[allocation.itemIndex].weeklyPlanSnapshot?.meals.some(meal => meal.day === allocation.componentDay))))) return [];
  if (order.fulfilments?.length) return order.fulfilments.map(day => ({ ...base, key: `${order.id}:${day.id}`, fulfilmentId: day.id, date: day.date, time: day.time, method: day.method, notes: [order.notes, (day as typeof day & {notes?: string}).notes].filter(Boolean).join(' · '),
    items: day.allocations.map(allocation => {
      const item = order.items[allocation.itemIndex];
      if (!item) throw new Error('This fulfilment has a missing item snapshot.');
      if (!allocation.componentDay) return ticketItem(item, allocation.quantity);
      const meal = item.weeklyPlanSnapshot?.meals.find(meal => meal.day === allocation.componentDay);
      if (!meal) throw new Error('This fulfilment has a missing meal snapshot.');
      return { name: meal.productName, quantity: allocation.quantity, modifiers: [...mealOptions(meal), ...(item.notes ? [`Notes: ${item.notes}`] : [])] };
    }) }));
  if (order.weeklyFulfilments?.length) return order.weeklyFulfilments.map(day => ({ ...base, key: `${order.id}:weekly:${day.date}:${day.day}`, weeklyDay: day.day, date: day.date, time: day.pickupTime, method: order.fulfilmentMethod || 'pickup', items: [{ name: day.productName, quantity: day.quantity, modifiers: mealOptions(day) }] }));
  const legacy = legacyDailyFulfilments(order);
  if (legacy) return getOrderTickets({...order, fulfilments: legacy});
  if (order.items.some(item => item.healthyLunchSnapshot?.date)) return [];
  // Do not accidentally print an unscheduled weekly parent as a single-day order.
  if (order.items.some(item => item.weeklyPlanSnapshot)) return [];
  if (!order.delivery?.schedule?.date && !order.pickupDate && !order.externalOrder && order.delivery?.fulfilmentMode !== 'instant') return [];
  return [{ ...base, key: `${order.id}:single`, date: order.delivery?.schedule?.date || order.pickupDate || toMalaysiaDateKey(order.createdAt), time: order.delivery?.schedule?.time || order.pickupTime || ((order.externalOrder?.source === 'walk_in' || order.delivery?.fulfilmentMode === 'instant') ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit' }).format(new Date(order.createdAt)) : ''), method: order.fulfilmentMethod || 'pickup', items: order.items.map(item => ticketItem(item)) }];
}
const esc = (value: string | number) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const REORDER_URL = 'https://misechef.ai/store/misechef-s-grab-go-store';
export function reorderQrSvg() {
  const qr = QRCode.create(REORDER_URL, {errorCorrectionLevel: 'M'}); const size = qr.modules.size;
  const cells: string[] = [];
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) if(qr.modules.get(y,x)) cells.push(`M${x+4},${y+4}h1v1h-1z`);
  return `<svg class="qr" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size+8} ${size+8}" role="img" aria-label="Scan to order again"><rect width="100%" height="100%" fill="white"/><path d="${cells.join('')}" fill="black"/></svg>`;
}
export function buildTicketDocument(tickets: OrderTicket[], kind: 'customer' | 'kitchen' = 'customer', reprint = false) {
  if (!tickets.length) throw new Error('Select at least one fulfilment.');
  const render = (ticket: OrderTicket) => `<article><div class="ticket-content">
    <header>${kind === 'customer' ? `<div class="brand"><div class="official-logo">${officialLogo}</div><div><b class="store-name">${esc(ticket.storeName)}</b><small class="byline">by MiseChef</small></div></div>` : `<b class="store-name">${esc(ticket.storeName)}</b>`}<span class="payment ${ticket.paid === true ? 'paid' : 'unpaid'}">${ticket.paid === true ? 'PAID' : 'PENDING / UNPAID'}</span></header>
    <div class="ticket-label">${kind === 'kitchen' ? 'KITCHEN TICKET' : 'CUSTOMER TICKET'}<i class="reprint">${reprint ? ' · REPRINT' : ''}</i></div>
    <div class="identity"><h2>${esc(ticket.orderNumber)}</h2><div class="pickup-code"><small>Pickup code</small><b>${esc(ticket.pickupCode || '—')}</b></div></div>
    <div class="schedule"><b>${esc(ticket.date)} ${esc(ticket.time)}</b><span>${ticket.method === 'delivery' ? 'Delivery' : 'Pickup'}</span></div>
    <div class="customer"><strong>${esc(ticket.customerName)}</strong><span>${esc(ticket.source || 'Online Store')}</span></div>
    <ul>${ticket.items.map(item => `<li><b>${esc(item.quantity)} × ${esc(item.name)}</b>${item.modifiers.map(modifier => `<small class="modifier">${esc(modifier)}</small>`).join('')}</li>`).join('')}</ul>
    ${ticket.notes ? `<div class="instructions"><b>SPECIAL INSTRUCTIONS</b><p>${esc(ticket.notes)}</p></div>` : ''}
    ${kind === 'customer' ? `<footer><div class="thanks"><b>Thank You!</b><small>Enjoy Your Healthy Lunch!</small><small class="contact">WhatsApp: 016-4209116 · @misechef.ai</small></div><div class="reorder">${reorderQrSvg()}<small>Scan to Order Again</small></div></footer>` : ''}
    </div></article>`;
  const sheets = Array.from({ length: Math.ceil(tickets.length / 8) }, (_, page) => `<section class="sheet">${tickets.slice(page * 8, page * 8 + 8).map(render).join('')}</section>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${kind === 'kitchen' ? 'Kitchen' : 'Customer'} Tickets</title><style>
@page{size:A4 portrait;margin:8mm}*{box-sizing:border-box}body{margin:0;background:#eee;color:#20352c;font:11px/1.2 Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sheet{width:194mm;height:280mm;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(4,minmax(0,1fr));break-after:page;background:white}.sheet:last-of-type{break-after:auto}
article{padding:3mm;border:0.2mm dashed #a7b1aa;overflow-wrap:anywhere;break-inside:avoid;min-width:0;min-height:0}.ticket-content{height:100%;display:flex;flex-direction:column;min-height:0}
header,.brand,.identity,.schedule,.customer,footer{display:flex;justify-content:space-between;align-items:center;gap:2mm}.brand{justify-content:flex-start}.official-logo{width:8mm;height:8mm;flex:none}.official-logo svg{display:block;width:100%;height:100%}.store-name{font-size:1.45em;letter-spacing:-.035em}.byline{font-size:.72em;letter-spacing:.08em;color:#536a5b}
.payment{font-size:.75em;font-weight:700;padding:1mm 1.5mm;border:1px solid #829b87;border-radius:2mm;white-space:nowrap}.paid{background:#e1ede3;color:#28573a}.unpaid{background:white;color:#333;border-color:#555}
.ticket-label{font-size:.75em;font-weight:700;letter-spacing:.18em;border-bottom:1px solid #9daf9f;padding:.7mm 0 1mm;margin-top:.5mm}.reprint{font-style:normal;letter-spacing:0}
h2{font-size:1.45em;margin:1mm 0;font-weight:800}.pickup-code{text-align:right}.pickup-code small{font-size:.65em;text-transform:uppercase}.pickup-code b{font-size:1.1em;letter-spacing:.1em}
.schedule{background:#eff4ee;border-radius:1mm;padding:1mm 1.5mm;font-size:.95em}.customer{padding:1mm 0;border-bottom:1px solid #dce4dc}.customer span{font-size:.8em}
ul{list-style:none;padding:0;margin:1mm 0}li{padding:.6mm 0;border-bottom:1px solid #e7ece7}li b{font-size:1.08em}small{display:block;font-size:.85em}.modifier{margin-top:.3mm;color:#374b3b}.instructions{margin:.6mm 0;padding:1mm 1.5mm;background:#f0f4ef;border-left:2px solid #7d977e}.instructions>b{font-size:.7em;letter-spacing:.08em}.instructions p{margin:.5mm 0 0;font-weight:600}
footer{margin-top:auto;padding-top:1mm;border-top:1px solid #9daf9f;flex-shrink:0}.thanks{text-align:center;flex:1}.thanks>b{font:italic 1.7em Georgia,serif}.thanks>small{margin-top:.6mm}.contact{font-size:.65em;color:#536a5b}.reorder{text-align:center;flex:none}.qr{width:14mm;height:14mm;display:block;margin:auto;shape-rendering:crispEdges}.reorder small{font-size:.62em;font-weight:700}
body.ticket-kitchen{color:#000}body.ticket-kitchen article{border-color:#888}body.ticket-kitchen header{border-bottom:2px solid black;padding-bottom:1mm}body.ticket-kitchen .ticket-label{border-color:#000;font-size:1em}body.ticket-kitchen h2{font-size:1.9em}body.ticket-kitchen .schedule{background:white;border:1px solid #000;font-size:1.25em}body.ticket-kitchen li{border-color:#999;padding:1mm 0}body.ticket-kitchen li b{font-size:1.4em}body.ticket-kitchen .modifier{font-size:1.05em;font-weight:700;color:#000}body.ticket-kitchen .instructions{background:white;border:2px solid #000;font-size:1.1em}body.ticket-kitchen .payment{background:white;color:#000;border-color:#000}body.ticket-kitchen .customer{border-color:#000}
nav{padding:12px;color:#000}nav button{padding:10px 16px}#print-error{font-weight:bold;color:#900}@media print{body{background:white}nav{display:none}.sheet{margin:0}}@media screen{.sheet{margin:12px auto}}
</style></head><body class="ticket-${kind}"><nav><button onclick="window.printTickets()">Print / Reprint</button> A4 · Portrait · 100% scale <span id="print-error" role="alert"></span></nav>${sheets}<script>
window.fitTickets=function(){let overflow=false;document.querySelectorAll('article').forEach(function(ticket){let size=11;ticket.style.fontSize=size+'px';const content=ticket.querySelector('.ticket-content');while((content.scrollHeight>content.clientHeight+1||content.scrollWidth>content.clientWidth+1)&&size>7){size-=0.5;ticket.style.fontSize=size+'px'}if(content.scrollHeight>content.clientHeight+1||content.scrollWidth>content.clientWidth+1)overflow=true});document.getElementById('print-error').textContent=overflow?'This fulfilment exceeds one ticket. No text has been removed. Reduce the notes or use the full order detail before printing.':'';return !overflow};
window.printTickets=function(){if(!window.fitTickets()){alert(document.getElementById('print-error').textContent);return}window.print();document.querySelectorAll('.reprint').forEach(function(label){label.textContent=' · REPRINT'})};window.addEventListener('beforeprint',window.fitTickets);window.fitTickets();
</script></body></html>`;
}
export function printOrderTickets(tickets: OrderTicket[], kind: 'customer' | 'kitchen' = 'customer', reprint = false) {
  const html = buildTicketDocument(tickets, kind, reprint);
  const popup = window.open('', '_blank', 'width=900,height=900');
  if (!popup) throw new Error('Allow pop-ups to print tickets.');
  try { popup.opener = null; } catch { /* Browser may expose a read-only opener. */ }
  popup.document.open(); popup.document.write(html); popup.document.close();
  popup.setTimeout(() => { popup.focus(); const print = (popup as Window & { printTickets?: () => void }).printTickets; if (print) print(); else popup.print(); }, 100);
}
