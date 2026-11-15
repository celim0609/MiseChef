import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { calculateStoreOptionAdjustedPrice } from './storeModel';
import { calculateStoreSetAnalysis } from './storeSetModel';

const pageSource = readFileSync(new URL('./StorePosPage.tsx', import.meta.url), 'utf8');
const walkInSource = readFileSync(new URL('./posWalkIn.ts', import.meta.url), 'utf8');
const serviceSource = readFileSync(new URL('./services/storeOrderService.ts', import.meta.url), 'utf8');
const ordersPanelSource = readFileSync(new URL('./StoreOrdersPanel.tsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
const groupKitchenSource = readFileSync(new URL('./groupKitchenOrderModel.ts', import.meta.url), 'utf8');
const firestoreIndexes = JSON.parse(readFileSync(new URL('../../../firestore.indexes.json', import.meta.url), 'utf8')) as {
  indexes: Array<{ collectionGroup: string; fields: Array<{ fieldPath: string; order: string }> }>;
};

test('POS groups three active kitchen statuses and moves Completed to a compact summary', () => {
  for (const label of ['New', 'Preparing', 'Ready']) {
    assert.match(pageSource, new RegExp(`label: '${label}'`));
  }
  assert.doesNotMatch(pageSource, /status: 'Completed', label: 'Completed'/);
  assert.match(pageSource, /completedPeriodEntries/);
  assert.match(pageSource, /View Completed/);
  assert.match(pageSource, /<audio ref=\{audioRef\}/);
  assert.match(pageSource, /grid-cols-1 items-start gap-3 lg:grid-cols-3/);
});

test('Walk-in POS uses canonical external-order metadata, option selections, and paid-only receipt actions', () => {
  assert.match(walkInSource, /externalOrder\?\.source === 'walk_in'/);
  assert.match(walkInSource, /isWalkInOrder\(order\) \? 'Walk-in'/);
  assert.match(pageSource, /createExternalPosOrder/);
  assert.match(pageSource, /selectedOptions/);
  assert.match(pageSource, /hasRequiredExternalOptions/);
  assert.doesNotMatch(pageSource, /externalSource !== 'walk_in' && \(!externalName/);
  assert.match(pageSource, /isWalkInOrder\(order\) && order\.payment\.status === "paid"/);
  assert.match(pageSource, /printWalkInReceipt\(createdOrder\)/);
  assert.match(pageSource, /catch \{\s*\/\/ The persisted order remains available for POS-card reprint/s);
});

test('POS extends the shared realtime service with a tenant-safe ordered Store query', () => {
  const posSubscriptionSource = serviceSource.slice(
    serviceSource.indexOf('subscribePosOrders('),
    serviceSource.indexOf('subscribeOperationalOrders(')
  );
  assert.match(serviceSource, /subscribePosOrders/);
  assert.match(serviceSource, /'New',[\s\S]*'Confirmed',[\s\S]*'Paid',[\s\S]*'Preparing',[\s\S]*'Ready'/);
  assert.match(serviceSource, /where\('storeId', '==', storeId\)/);
  assert.match(serviceSource, /where\('workspaceId', '==', workspaceId\)/);
  assert.match(posSubscriptionSource, /where\('fulfilmentStatus', 'in', ACTIVE_FULFILMENT_STATUSES\)/);
  assert.match(serviceSource, /orderBy\('createdAt', 'desc'\)/);
  assert.doesNotMatch(posSubscriptionSource, /limit\(/);
  assert.match(serviceSource, /isOrderOperationallyEligible/);
  assert.match(serviceSource, /unresolvedGroupIds/);
  assert.match(serviceSource, /onData\(kitchenOrders, addedNewOrderIds\)/);
  assert.match(serviceSource, /!knownOperationalOrderIds\.has\(order\.id\)/);
  assert.match(pageSource, /addedNewOrderIds\.length > 0/);
  assert.match(pageSource, /audioRef\.current\.play\(\)/);
});

test('POS has the requested one-tap operational transitions and a dedicated route', () => {
  assert.match(pageSource, /status === 'New'.*return 'Preparing'/s);
  assert.match(pageSource, /status === 'Preparing'.*return 'Ready'/s);
  assert.match(pageSource, /status === 'Ready'.*return 'Completed'/s);
  assert.match(pageSource, /actionLabel: 'Accept → Preparing'/);
  assert.match(appSource, /storePos: '\/app\/store\/pos'/);
  assert.match(appSource, /onOpenPos=\{\(\) => handleRootNavigate\('storePos'\)\}/);
});

test('POS uses one operational header with working local theme state and no duplicate app header', () => {
  assert.match(pageSource, /data-pos-theme=\{isNightMode \? 'dark' : 'light'\}/);
  assert.match(pageSource, /setIsNightMode\(current => !current\)/);
  assert.match(pageSource, /aria-pressed=\{isNightMode\}/);
  assert.match(appSource, /activeTab !== 'storePos' && <Header/);
  assert.match(pageSource, /notificationAction/);
});

test('Order History is date-scoped independently from the realtime listener', () => {
  assert.match(pageSource, /activeView !== 'history'/);
  assert.match(pageSource, /getMalaysiaDateRange\(historyDateKey\)/);
  assert.match(pageSource, /getOrdersForBusinessDate/);
  assert.match(pageSource, /Creation date/);
  assert.match(pageSource, /Completion date/);
  assert.match(pageSource, /Search order #/);
  assert.match(serviceSource, /where\('createdAt', '>=', Timestamp\.fromDate\(start\)\)/);
  assert.match(serviceSource, /where\('createdAt', '<', Timestamp\.fromDate\(end\)\)/);
  assert.match(serviceSource, /where\('createdAt', '>=', start\.toISOString\(\)\)/);
  assert.match(serviceSource, /getCompletedOrdersForBusinessDate/);
  assert.match(serviceSource, /where\('storeId', '==', storeId\)/);
  assert.match(serviceSource, /where\('workspaceId', '==', workspaceId\)/);
  assert.match(serviceSource, /where\('fulfilmentStatus', '==', 'Completed'\)/);
  assert.match(serviceSource, /where\('completedAt', '>=', Timestamp\.fromDate\(start\)\)/);
  assert.match(serviceSource, /where\('completedAt', '<', Timestamp\.fromDate\(end\)\)/);
  assert.match(serviceSource, /where\('completedAt', '>=', start\.toISOString\(\)\)/);
  assert.match(serviceSource, /where\('completedAt', '<', end\.toISOString\(\)\)/);
  assert.match(serviceSource, /limit\(STORE_ORDER_DATE_QUERY_LIMIT\)/);
  assert.match(pageSource, /isOrderCompletedOnMalaysiaDate/);
  assert.match(pageSource, /openCompletedHistory/);
});

test('Store Orders keeps every active state realtime and paginates terminal history', () => {
  const operationalSubscriptionSource = serviceSource.slice(
    serviceSource.indexOf('subscribeOperationalOrders('),
    serviceSource.indexOf('async getTerminalOrderHistoryPage(')
  );
  const terminalHistorySource = serviceSource.slice(
    serviceSource.indexOf('async getTerminalOrderHistoryPage('),
    serviceSource.indexOf('async getOrdersForBusinessDate(')
  );
  assert.match(operationalSubscriptionSource, /where\('storeId', '==', storeId\)/);
  assert.match(operationalSubscriptionSource, /where\('workspaceId', '==', workspaceId\)/);
  assert.match(operationalSubscriptionSource, /where\('fulfilmentStatus', 'in', ACTIVE_FULFILMENT_STATUSES\)/);
  assert.doesNotMatch(operationalSubscriptionSource, /limit\(/);
  assert.match(terminalHistorySource, /getDocs\(query\(/);
  assert.doesNotMatch(terminalHistorySource, /onSnapshot\(/);
  assert.match(terminalHistorySource, /where\('fulfilmentStatus', 'in', TERMINAL_FULFILMENT_STATUSES\)/);
  assert.match(terminalHistorySource, /startAfter\(cursor\)/);
  assert.match(terminalHistorySource, /limit\(STORE_ORDER_HISTORY_PAGE_SIZE \+ 1\)/);
  assert.match(ordersPanelSource, /subscribeOperationalOrders/);
  assert.match(ordersPanelSource, /getTerminalOrderHistoryPage/);
  assert.match(ordersPanelSource, /Load More History/);
});

test('the new order listener shapes have matching composite indexes', () => {
  const hasIndex = (collectionGroup: string, fieldPaths: string[]) => firestoreIndexes.indexes.some(index => (
    index.collectionGroup === collectionGroup
    && index.fields.map(field => field.fieldPath).join(',') === fieldPaths.join(',')
  ));
  assert.equal(hasIndex('storeOrders', ['storeId', 'workspaceId', 'fulfilmentStatus', 'createdAt']), true);
  assert.equal(hasIndex('storeOrders', ['storeId', 'workspaceId', 'fulfilmentStatus', 'fulfilmentUpdatedAt']), true);
  assert.equal(hasIndex('storeOrders', ['storeId', 'workspaceId', 'fulfilmentStatus', 'completedAt']), true);
  assert.equal(hasIndex('storeNotifications', ['storeId', 'workspaceId', 'createdAt']), true);
});

test('safe cancellation requires confirmation and preserves payment semantics', () => {
  assert.match(pageSource, /role="dialog"/);
  assert.match(pageSource, /Cancellation reason/);
  assert.match(pageSource, /Canceling this order does not refund the payment/);
  assert.match(pageSource, /updateFulfilment\(cancelOrder\.id, 'Cancelled', cancellationReason\)/);
  assert.match(pageSource, /order\.cancellationReason/);
  assert.match(pageSource, /order\.cancelledAt/);
});

test('footer reads the Store document and labels the exact active-online definition', () => {
  assert.match(pageSource, /storeService\.getWorkspaceStore\(workspaceId\)/);
  assert.match(pageSource, /store\?\.name/);
  assert.match(pageSource, /Active Online Orders/);
  assert.match(pageSource, /countActiveOnlineOrders\(orders\)/);
});

test('Group Kitchen cards use exact Group ids and one server-authorized batch action', () => {
  assert.match(pageSource, /buildGroupKitchenEntries\(orders\.filter\([\s\S]*?column\.status, storePickupSessions\)/);
  assert.match(pageSource, /data-group-order-id=\{entry\.groupId\}/);
  assert.match(pageSource, /data-store-order-id=\{order\.id\}/);
  assert.match(pageSource, /member\.position.*member\.total.*order\.customerName/s);
  assert.match(pageSource, /formatMalaysiaBusinessDate\(entry\.pickupDate\).*entry\.pickupSession/s);
  assert.match(pageSource, /entry\.paidOrderCount.*entry\.eligibleOrderCount/s);
  assert.match(pageSource, /formatStoreOrderSetSelection/);
  assert.match(pageSource, /option\.groupName.*option\.optionName/s);
  assert.match(pageSource, /Remark: \{order\.notes\}/);
  assert.match(pageSource, /updateGroupFulfilment\(entry\.groupId, entry\.batchAction\)/);
  assert.match(pageSource, /Start Preparing Group/);
  assert.match(pageSource, /Mark Group Ready/);
  assert.match(pageSource, /Complete Group/);
  assert.match(pageSource, /Awaiting payment/);
  assert.doesNotMatch(pageSource, /advanceOrder\(member\.order\)/);
  assert.match(serviceSource, /updateStoreGroupOrderBatchStatus/);
  assert.match(groupKitchenSource, /candidateGroups\.get\(groupId\)/);
  assert.match(groupKitchenSource, /order\.payment\.status !== 'paid'/);
  assert.doesNotMatch(groupKitchenSource, /groupOrder\?\.name.*Map|hostName.*Map|pickupSession.*Map/);
});

test('normal non-Group Kitchen cards keep their independent fulfilment action', () => {
  assert.match(pageSource, /void advanceOrder\(order\)/);
  assert.match(pageSource, /column\.actionLabel/);
  assert.match(serviceSource, /updateStoreOrderStatus/);
});

// Execute the actual handler with isolated services; no Firebase or order writes.
const createExternalOrderSource = pageSource.slice(
  pageSource.indexOf('  const createExternalOrder = async () => {'),
  pageSource.indexOf('  const addExternalProduct =')
);
const makeExternalOrderHarness = (overrides: Record<string, unknown> = {}) => {
  const state = { error: '', loading: false, open: true, cart: [{ selection: { productId: 'tea', selectedOptions: [] }, quantity: 2 }] as unknown[], printed: 0 };
  const lock = { current: false };
  const requests: Record<string, unknown>[] = [];
  const scope = {
    externalSubmitInFlightRef: lock,
    externalRequestIdRef: {current: 'request-1234567890'},
    externalCart: state.cart,
    creatingExternal: false,
    externalMethod:'pickup', externalAddress:'', externalDate:'', externalTime:'',
    setExternalMethod:()=>{}, setExternalAddress:()=>{}, setExternalDate:()=>{}, setExternalTime:()=>{},
    externalSource: 'walk_in', externalName: '', externalPhone: '', externalNotes: '', externalNumber: '',
    workspaceId: 'workspace-a', storeId: 'workspace-a',
    setCreatingExternal: (value: boolean) => { state.loading = value; },
    setExternalError: (value: string) => { state.error = value; },
    setExternalOpen: (value: boolean) => { state.open = value; },
    setExternalCart: (value: unknown[]) => { state.cart = value; },
    setExternalNumber: () => {}, setExternalName: () => {}, setExternalPhone: () => {}, setExternalNotes: () => {},
    storeService: { getWorkspaceStore: async () => ({ slug: 'store-a' }) },
    storeOrderService: {
      createExternalPosOrder: async (payload: Record<string, unknown>) => { requests.push(payload); return { orderId: 'order-a' }; },
      getOrder: async () => ({ id: 'order-a', externalOrder: { source: 'walk_in' }, payment: { status: 'paid' } })
    },
    isWalkInOrder: (order: { externalOrder: { source: string } }) => order.externalOrder.source === 'walk_in',
    printWalkInReceipt: () => { state.printed += 1; },
    ...overrides
  };
  assert.ok(createExternalOrderSource.startsWith('  const createExternalOrder = async () => {'));
  const submit = new Function(...Object.keys(scope), `${createExternalOrderSource}\nreturn createExternalOrder;`)(...Object.values(scope)) as () => Promise<void>;
  return { state, lock, requests, submit };
};

test('POS synchronous lock prevents rapid double submit before React loading state updates', async () => {
  let finishLookup!: (store: { slug: string }) => void;
  const lookup = new Promise(resolve => { finishLookup = resolve; });
  const harness = makeExternalOrderHarness({ storeService: { getWorkspaceStore: () => lookup } });
  const first = harness.submit();
  assert.equal(harness.lock.current, true);
  assert.equal(harness.state.loading, true);
  await harness.submit();
  assert.equal(harness.requests.length, 0);
  finishLookup({ slug: 'store-a' });
  await first;
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.lock.current, false);
  assert.equal(harness.state.loading, false);
  assert.equal(harness.state.open, false);
  assert.equal(harness.state.printed, 1);
});

test('server phone validation error stays in the modal, retains the cart and allows a retry', async () => {
  let attempts = 0;
  const harness = makeExternalOrderHarness({
    externalPhone: '1',
    storeOrderService: {
      createExternalPosOrder: async (payload: { phone: string; customerName: string }) => {
        attempts += 1;
        assert.equal(payload.phone, '1');
        assert.equal(payload.customerName, '');
        throw new Error('Enter a valid phone number.');
      }
    }
  });
  await harness.submit();
  assert.equal(harness.state.error, 'Enter a valid phone number.');
  assert.equal(harness.state.open, true);
  assert.equal(harness.state.cart.length, 1);
  assert.equal(harness.lock.current, false);
  assert.equal(harness.state.loading, false);
  await harness.submit();
  assert.equal(attempts, 2);
});

test('empty carts never acquire the submission lock or call the API', async () => {
  const harness = makeExternalOrderHarness({ externalCart: [] });
  await harness.submit();
  assert.equal(harness.requests.length, 0);
  assert.equal(harness.lock.current, false);
  assert.equal(harness.state.loading, false);
});

for (const [source, paymentLabel] of [['walk_in', 'walk_in_paid'], ['shopeefood', 'shopeefood_platform_paid'], ['other', 'other_paid']]) {
  test(`${source} keeps its existing payload and payment label`, async () => {
    const customerName = '';
    const phone = '';
    const harness = makeExternalOrderHarness({ externalSource: source, externalName: customerName, externalPhone: phone });
    await harness.submit();
    assert.equal(harness.requests.length, 1);
    assert.equal(harness.requests[0].requestId, 'request-1234567890');
    assert.equal(harness.requests[0].source, source);
    assert.equal(harness.requests[0].paymentLabel, paymentLabel);
    assert.equal(harness.requests[0].customerName, customerName);
    assert.equal(harness.requests[0].phone, phone);
    assert.deepEqual(harness.requests[0].selections, [{ productId: 'tea', selectedOptions: [], quantity: 2 }]);
    assert.equal(harness.state.printed, source === 'walk_in' ? 1 : 0);
  });
}

test('receipt failure does not turn an already-created Walk-in order into a submission error', async () => {
  const harness = makeExternalOrderHarness({ printWalkInReceipt: () => { throw new Error('Printer unavailable'); } });
  await harness.submit();
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.state.error, '');
  assert.equal(harness.state.open, false);
  assert.equal(harness.state.cart.length, 0);
  assert.equal(harness.lock.current, false);
});

test('POS Add Order uses document flow with catalog before cart and no modal scrolling', () => {
  const modal = pageSource.slice(pageSource.indexOf('      <div hidden={!externalOpen}>'));
  assert.match(modal, /aria-labelledby="pos-order-entry-title"/);
  assert.doesNotMatch(modal, /role="dialog"|aria-modal|fixed|sticky|overflow-y|overflow-auto|max-h-|h-\[92dvh\]/);
  assert.match(modal, /Back to POS/);
  assert.match(modal, /grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4/);
  assert.doesNotMatch(modal, /Search catalog|Search POS products and sets/);
  assert.ok(modal.indexOf('aria-label="Store products"') < modal.indexOf('aria-label="Order cart"'));
  assert.match(modal, /hidden=\{externalCategory === 'sets'\}/);
  assert.match(modal, /Cart is empty/);
  assert.match(modal, /item\.unitPrice\.toFixed\(2\)/);
  assert.match(modal, /item\.lineTotal\.toFixed\(2\)/);
  assert.match(modal, /externalSubtotal\.toFixed\(2\)/);
  assert.match(modal, /<footer className="border-t/);
  assert.match(modal, /\{externalError && <p[^>]*role="alert"[^>]*>\{externalError\}<\/p>\}\s*<button[^>]*onClick=\{\(\) => void createExternalOrder\(\)\}/);
  assert.match(modal, /aria-busy=\{creatingExternal\}/);
  assert.match(modal, /className="[^"]*w-full[^"]*bg-blue-700[^"]*disabled:cursor-not-allowed[^"]*disabled:bg-slate-200/);
  assert.match(modal, /creatingExternal \? 'Creating…' : 'Confirm Order'/);
  assert.doesNotMatch(createExternalOrderSource, /setErrorMessage\(/);
});

test('cart preview preserves option adjustments, Set upgrades, quantities and rounded subtotal', () => {
  const pricingSource = pageSource.slice(pageSource.indexOf('  const externalCartLines ='), pageSource.indexOf('\n  const advanceGroup ='));
  const calculate = new Function('externalCart', 'externalProducts', 'externalOptionGroups', 'externalSets', 'calculateStoreOptionAdjustedPrice', 'calculateStoreSetAnalysis', 'externalStore', 'externalDate', 'externalTime', `${pricingSource}\nreturn { externalCartLines, externalSubtotal };`);
  const products = [{ id: 'tea', name: 'Tea', available: true, price: 10 }];
  const groups = [{ id: 'flavour', available: true, options: [{ id: 'milk', available: true, priceAdjustment: 2.5 }] }];
  const sets = [{ id: 'set-a', price: 20, groups: [{ id: 'drink', options: [{ productId: 'tea', priceAdjustment: 3 }] }] }];
  const cart = [
    { key: 'product:tea', label: 'Tea', quantity: 3, selection: { productId: 'tea', selectedOptions: [{ groupId: 'flavour', optionId: 'milk' }] } },
    { key: 'set:set-a', label: 'Set', quantity: 2, selection: { setId: 'set-a', selectedOptions: [], selectedSetItems: [{ groupId: 'drink', productId: 'tea' }] } }
  ];
  const result = calculate(cart, products, groups, sets, calculateStoreOptionAdjustedPrice, calculateStoreSetAnalysis);
  assert.equal(result.externalCartLines[0].unitPrice, 12.5);
  assert.equal(result.externalCartLines[0].lineTotal, 37.5);
  assert.equal(result.externalCartLines[1].unitPrice, 23);
  assert.equal(result.externalCartLines[1].lineTotal, 46);
  assert.equal(result.externalSubtotal, 83.5);
  assert.equal(calculate([], products, groups, sets, calculateStoreOptionAdjustedPrice, calculateStoreSetAnalysis).externalSubtotal, 0);
});

test('a Store lookup failure is displayed in the modal and releases the submit lock', async () => {
  const harness = makeExternalOrderHarness({ storeService: { getWorkspaceStore: async () => { throw new Error('Store unavailable'); } } });
  await harness.submit();
  assert.equal(harness.requests.length, 0);
  assert.equal(harness.state.error, 'Store unavailable');
  assert.equal(harness.state.open, true);
  assert.equal(harness.state.loading, false);
  assert.equal(harness.lock.current, false);
});


test('POS puts one header and unified section navigation before its content', () => {
  const layout = pageSource.slice(pageSource.indexOf('  return (\n    <section data-pos-theme'));
  assert.ok(layout.indexOf('<header') < layout.indexOf('aria-label="POS sections"'));
  assert.ok(layout.indexOf('aria-label="POS sections"') < layout.indexOf('aria-label="Fulfilment period"'));
  assert.ok(layout.indexOf('aria-label="Fulfilment period"') < layout.indexOf('<main'));
  assert.match(layout, /id:'live',label:'POS Live'.*id:'history',label:'View Orders'.*id:'tickets',label:'Print Tickets'/);
  assert.equal((layout.match(/<OrderTicketPanel /g) || []).length, 1);
  assert.doesNotMatch(layout, /min-w-\[1040px\]|min-h-\[65vh\]|Live Queue/);
  assert.match(layout, /grid-cols-1 items-start gap-3 lg:grid-cols-3/);
});

test('fulfilment history renders its grid instead of mounting empty live columns', () => {
  assert.match(pageSource, /activeView === 'live' \? dailyView === 'History' \? \(/);
  assert.match(pageSource, /view=\{dailyView\}.*orders=\{dailyOrders\}/);
  assert.match(pageSource, /if\(view === 'History' && !dailyHistory\) void loadDailyHistory/);
  const queue = readFileSync(new URL('./DailyFulfilmentQueue.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(queue, /onViewChange|aria-pressed/);
  assert.match(queue, /sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4/);
});


test('kitchen Kanban keeps compact single stacks and a collapsed Completed section below active statuses', () => {
  const board = pageSource.slice(pageSource.indexOf('<div aria-label="Active kitchen board"'), pageSource.indexOf('<details'));
  assert.match(board, /grid-cols-1 items-start gap-3 lg:grid-cols-3/);
  assert.match(board, /grid min-w-0 grid-cols-1 items-start gap-2/);
  assert.doesNotMatch(board, /min-h-\[|min-w-\[|sm:grid-cols|2xl:grid-cols/);
  assert.match(board, /columnOrders.length === 0 && dailyColumn.length === 0/);
  assert.match(board, /No orders/);
  assert.match(board, /order.customerName/);
  assert.match(board, /ticket.date.*ticket.time/);
  assert.match(pageSource, /<details onToggle=[\s\S]*<summary[^>]*>Completed · \{completedPeriodEntries.length\}/);
  assert.doesNotMatch(pageSource, /<details[^>]* open/);
  assert.match(pageSource, /event.currentTarget.open && !dailyHistory && !loadingDailyHistory/);
  assert.match(pageSource, /Load older completed fulfilments/);
  assert.equal((pageSource.match(/aria-label="Fulfilment period"/g) || []).length, 1);
});


test('external delivery payload preserves each selected meal date and exact time',async()=>{
 const cart=[{selection:{productId:'plan',healthyLunchDate:'2026-10-26',selectedOptions:[]},quantity:1,date:'2026-10-26',time:'12:13'},{selection:{productId:'plan',healthyLunchDate:'2026-10-28',selectedOptions:[]},quantity:2,date:'2026-10-28',time:'13:17'}];
 const harness=makeExternalOrderHarness({externalSource:'whatsapp',externalMethod:'delivery',externalAddress:'Unit 12, Full Street',externalDate:'2026-10-30',externalTime:'15:17',externalCart:cart});
 await harness.submit();assert.equal(harness.state.error,'');assert.equal(harness.requests.length,1);
 const payload=harness.requests[0];assert.equal(payload.source,'whatsapp');assert.equal(payload.fulfilmentMethod,'delivery');assert.equal(payload.deliveryAddress,'Unit 12, Full Street');
 assert.deepEqual(payload.lineSchedules,[{date:'2026-10-26',time:'12:13'},{date:'2026-10-28',time:'13:17'}]);assert.equal(payload.customerName,'');assert.equal(payload.phone,'');
});
