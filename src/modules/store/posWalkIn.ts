import type { StoreOrder } from './types';

export const isWalkInOrder = (order: Pick<StoreOrder, 'externalOrder'>) => order.externalOrder?.source === 'walk_in';
export const getPosSourceLabel = (order: Pick<StoreOrder, 'orderSource' | 'externalOrder'>) => isWalkInOrder(order) ? 'Walk-in' : order.orderSource;

const esc = (value: string | number) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const printWalkInReceipt = (order: StoreOrder) => {
  if (!isWalkInOrder(order) || order.payment.status !== 'paid') return;

  // Do not use noopener here: some browsers return a WindowProxy whose document
  // is inaccessible/blank when features include noopener. We need the document
  // synchronously so the receipt can be written before print() is requested.
  const popup = window.open('', '_blank', 'width=360,height=640');
  if (!popup) throw new Error('Allow pop-ups to print the receipt.');

  // Protect the opener explicitly after opening instead of using the noopener
  // feature, while retaining access to the receipt document.
  try {
    popup.opener = null;
  } catch {
    // Some browsers expose opener as read-only; the receipt can still print.
  }

  const money = (amount: number) => `${order.currency} ${amount.toFixed(2)}`;
  const items = order.items.map(item => `<div class="item"><b>${esc(item.quantity)}× ${esc(item.productName)}</b>${item.selectedOptions.map(option => `<small>${esc(option.groupName)}: ${esc(option.optionName)}${option.quantity > 1 ? ` x${esc(option.quantity)}` : ''}</small>`).join('')}<span>${money(item.lineTotal)}</span></div>`).join('');
  const receiptHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${esc(order.orderNumber)}</title><style>@page{size:80mm auto;margin:4mm}html,body{background:#fff;color:#000}body{width:72mm;margin:0;font:12px/1.35 monospace}.center{text-align:center}.rule{border-top:1px dashed;margin:8px 0}.item{margin:7px 0}.item small{display:block;padding-left:10px}.item span{display:block}.row{display:flex;justify-content:space-between}.total{font-size:14px;font-weight:bold}</style></head><body><div class="center"><b>MiseChef</b><br>${esc(order.storeName)}</div><div class="rule"></div>Order: ${esc(order.orderNumber)}<br>Walk-in<br>${esc(new Intl.DateTimeFormat('en-MY',{timeZone:'Asia/Kuala_Lumpur',dateStyle:'medium',timeStyle:'short'}).format(new Date(order.createdAt)))}<div class="rule"></div>${items}<div class="rule"></div><div class="row"><span>Subtotal</span><span>${money(order.totals?.merchandiseSubtotal ?? order.total)}</span></div><div class="row total"><span>Total</span><span>${money(order.total)}</span></div><div class="rule"></div>Payment: Paid / Walk-in</body></html>`;

  popup.document.open();
  popup.document.write(receiptHtml);
  popup.document.close();

  const requestPrint = () => {
    popup.focus();
    popup.print();
  };

  // document.write() is synchronous for this self-contained receipt. Waiting for
  // load when needed also makes the helper reliable across Chrome/Safari variants.
  if (popup.document.readyState === 'complete') {
    window.setTimeout(requestPrint, 50);
  } else {
    popup.addEventListener('load', requestPrint, { once: true });
  }
};
