import type { StoreOrder } from './types';

export const isWalkInOrder = (order: Pick<StoreOrder, 'externalOrder'>) => order.externalOrder?.source === 'walk_in';
export const getPosSourceLabel = (order: Pick<StoreOrder, 'orderSource' | 'externalOrder'>) => isWalkInOrder(order) ? 'Walk-in' : order.orderSource;

const esc = (value: string | number) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const printWalkInReceipt = (order: StoreOrder) => {
  if (!isWalkInOrder(order) || order.payment.status !== 'paid') return;
  const popup = window.open('', '_blank', 'noopener,noreferrer,width=360,height=640');
  if (!popup) throw new Error('Allow pop-ups to print the receipt.');
  const money = (amount: number) => `${order.currency} ${amount.toFixed(2)}`;
  const items = order.items.map(item => `<div class="item"><b>${esc(item.quantity)}× ${esc(item.productName)}</b>${item.selectedOptions.map(option => `<small>${esc(option.groupName)}: ${esc(option.optionName)}</small>`).join('')}<span>${money(item.lineTotal)}</span></div>`).join('');
  popup.document.write(`<!doctype html><title>Receipt ${esc(order.orderNumber)}</title><style>@page{size:80mm auto;margin:4mm}body{width:72mm;margin:0;font:12px/1.35 monospace}.center{text-align:center}.rule{border-top:1px dashed;margin:8px 0}.item{margin:7px 0}.item small{display:block;padding-left:10px}.item span{display:block}.row{display:flex;justify-content:space-between}.total{font-size:14px;font-weight:bold}</style><body><div class="center"><b>MiseChef</b><br>${esc(order.storeName)}</div><div class="rule"></div>Order: ${esc(order.orderNumber)}<br>Walk-in<br>${esc(new Intl.DateTimeFormat('en-MY',{timeZone:'Asia/Kuala_Lumpur',dateStyle:'medium',timeStyle:'short'}).format(new Date(order.createdAt)))}<div class="rule"></div>${items}<div class="rule"></div><div class="row"><span>Subtotal</span><span>${money(order.totals?.merchandiseSubtotal ?? order.total)}</span></div><div class="row total"><span>Total</span><span>${money(order.total)}</span></div><div class="rule"></div>Payment: Paid / Walk-in<script>window.onload=()=>window.print()</script></body>`);
  popup.document.close();
};
