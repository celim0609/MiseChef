// Browser print QA fixtures. Open the generated files and verify A4 page counts:
// 1, 3 and 8 tickets => 1 page; 9 tickets => 2 pages. Never seed real orders.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildTicketDocument, type OrderTicket } from '../src/modules/store/orderTickets';
const directory = resolve(process.argv[2] || 'tmp/order-ticket-print-qa');
await mkdir(directory, { recursive: true });
const ticket: OrderTicket = { key: 'qa', orderId: 'qa', storeName: 'GG Grab&Go', orderNumber: 'QA-TICKET', pickupCode: 'QAZ2', customerName: 'QA Customer', date: '2026-10-19', time: '12:30', method: 'pickup', paid: true, notes: 'QA only. No chilli.', items: [{ name: 'Today’s rice meal', quantity: 2, modifiers: ['Sauce: Lemon ×2'] }] };
for (const count of [1, 3, 8, 9]) {
  await writeFile(resolve(directory, `${count}-customer-tickets.html`), buildTicketDocument(Array.from({ length: count }, (_, index) => ({ ...ticket, key: `qa-${index}`, orderNumber: `QA-TICKET-${index + 1}` }))));
}
await writeFile(resolve(directory, '1-kitchen-ticket.html'), buildTicketDocument([ticket], 'kitchen'));
console.log(`Print QA fixtures: ${directory}`);
