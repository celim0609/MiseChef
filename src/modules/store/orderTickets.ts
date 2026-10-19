import { validCalendarDate } from '../../../functions/storeWeeklyMealPlan.js';
import { legacyDailyFulfilments } from '../../../functions/legacyDailyFulfilments.js';
import QRCode from 'qrcode';
import type { MealOptionSnapshot, StoreOrder, StoreOrderItem } from './types';
import { toMalaysiaDateKey } from './posOrderModel';

export interface OrderTicket {
  key: string; orderId: string; fulfilmentId?: string; weeklyDay?: string;
  storeName: string; orderNumber: string; pickupCode: string; customerName: string;
  date: string; time: string; method: string; notes: string; paid?: boolean;
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
  const base = { orderId: order.id, storeName: order.storeName, orderNumber: order.orderNumber, pickupCode: order.pickupCode || '', customerName: order.customerName, notes: order.notes || '', paid: order.payment?.status === 'paid' };
  if (order.fulfilments?.some(day => !validCalendarDate(day.date) || !day.allocations?.length || day.allocations.some(allocation => !Number.isInteger(allocation.itemIndex) || !order.items[allocation.itemIndex] || !(allocation.quantity > 0) || (allocation.componentDay && !order.items[allocation.itemIndex].weeklyPlanSnapshot?.meals.some(meal => meal.day === allocation.componentDay))))) return [];
  if (order.fulfilments?.length) return order.fulfilments.map(day => ({ ...base, key: `${order.id}:${day.id}`, fulfilmentId: day.id, date: day.date, time: day.time, method: day.method, notes: [order.notes, (day as typeof day & {notes?: string}).notes].filter(Boolean).join(' · '),
    items: day.allocations.map(allocation => {
      const item = order.items[allocation.itemIndex];
      if (!item) throw new Error('This fulfilment has a missing item snapshot.');
      if (!allocation.componentDay) return ticketItem(item, allocation.quantity);
      const meal = item.weeklyPlanSnapshot?.meals.find(meal => meal.day === allocation.componentDay);
      if (!meal) throw new Error('This fulfilment has a missing meal snapshot.');
      return { name: meal.productName, quantity: allocation.quantity, modifiers: mealOptions(meal) };
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
  const sheets = Array.from({ length: Math.ceil(tickets.length / 8) }, (_, page) => `<section class="sheet">${tickets.slice(page * 8, page * 8 + 8).map(ticket => `<article><header><b>${esc(ticket.storeName)}</b><span>${kind === 'kitchen' ? 'Kitchen Ticket' : 'Customer Ticket'}<i class="reprint">${reprint ? ' · REPRINT' : ''}</i></span></header><h2>${esc(ticket.orderNumber)}${ticket.pickupCode ? ` · ${esc(ticket.pickupCode)}` : ''}</h2><strong>${esc(ticket.customerName)}</strong>${ticket.paid ? '<b class="paid"> · Paid</b>' : ''}<p>${esc(ticket.date)} ${esc(ticket.time)} · ${ticket.method === 'delivery' ? 'Delivery' : 'Pickup'}</p><ul>${ticket.items.map(item => `<li><b>${esc(item.quantity)} × ${esc(item.name)}</b>${item.modifiers.map(modifier => `<small>${esc(modifier)}</small>`).join('')}</li>`).join('')}</ul>${ticket.notes ? `<p><b>Notes:</b> ${esc(ticket.notes)}</p>` : ''}${kind === 'customer' ? `<footer>${reorderQrSvg()}<b>Thank you for your order!</b><small>Freshly prepared with care.</small><small>Order again: misechef.ai/store/misechef-s-grab-go-store</small><small>WhatsApp: 016-4209116 · Instagram: @misechef.ai</small><small>Powered by MiseChef</small></footer>` : ''}</article>`).join('')}</section>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${kind === 'kitchen' ? 'Kitchen' : 'Customer'} Tickets</title><style>@page{size:A4 portrait;margin:8mm}*{box-sizing:border-box}body{margin:0;background:#eee;color:#000;font:11px/1.25 Arial,sans-serif}.sheet{width:194mm;height:280mm;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(4,minmax(0,1fr));break-after:page;background:white}.sheet:last-of-type{break-after:auto}article{padding:4mm;border:0.2mm dashed #888;overflow-wrap:anywhere;break-inside:avoid}header{display:flex;justify-content:space-between;gap:2mm}header span{font-size:9px}h2{margin:2mm 0;font-size:1.45em}p{margin:1.5mm 0}ul{margin:2mm 0;padding-left:4mm}li{margin:1mm 0}small{display:block;font-size:0.91em}.qr{width:17mm;height:17mm;float:right;margin-left:1mm;shape-rendering:crispEdges}.reprint{font-style:normal}footer{border-top:1px solid #aaa;margin-top:2mm;padding-top:1.5mm;text-align:center;font-size:9px}footer small{font-size:8px}nav{padding:12px}@media print{body{background:white}nav{display:none}.sheet{margin:0}}@media screen{.sheet{margin:12px auto}}</style></head><body><nav><button onclick="window.printTickets()">Print / Reprint</button> A4 · Portrait · 100% scale</nav>${sheets}<script>window.printTickets=function(){let overflow=false;document.querySelectorAll('article').forEach(function(ticket){let size=11;ticket.style.fontSize=size+'px';while(ticket.scrollHeight>ticket.clientHeight+1&&size>7){size-=0.5;ticket.style.fontSize=size+'px'}if(ticket.scrollHeight>ticket.clientHeight+1)overflow=true});if(overflow){alert('A fulfilment has too much content for an A4 ticket. Print a smaller order ticket separately. No content has been removed.');return}window.print();document.querySelectorAll('.reprint').forEach(function(label){label.textContent=' · REPRINT'})};</script></body></html>`;
}
export function printOrderTickets(tickets: OrderTicket[], kind: 'customer' | 'kitchen' = 'customer', reprint = false) {
  const html = buildTicketDocument(tickets, kind, reprint);
  const popup = window.open('', '_blank', 'width=900,height=900');
  if (!popup) throw new Error('Allow pop-ups to print tickets.');
  try { popup.opener = null; } catch { /* Browser may expose a read-only opener. */ }
  popup.document.open(); popup.document.write(html); popup.document.close();
  popup.setTimeout(() => { popup.focus(); const print = (popup as Window & { printTickets?: () => void }).printTickets; if (print) print(); else popup.print(); }, 100);
}
