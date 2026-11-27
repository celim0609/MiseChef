import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { getWeeklyDates } from '../../../functions/storeWeeklyMealPlan.js';
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
  assert.match(pageSource, /searchPosHistory/);
  assert.doesNotMatch(pageSource, /getOrdersForBusinessDate/);
  assert.match(pageSource, /Fulfilment date/);
  assert.match(pageSource, /selectedBrowserRange/);
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
  assert.match(pageSource, /orders shown/);
  assert.doesNotMatch(pageSource, /unique orders in loaded matches|End of matching query/);
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
    promotionState:{ready:true,error:''},externalDiscount: undefined, externalDiscountPreview:{amountMinor:0,manualAmountMinor:0,expectation:undefined,error:''},setExternalDiscount:()=>{},
    externalSubmitInFlightRef: lock,
    externalAddTimes:{current:new Map()},
    externalRequestIdRef: {current: 'request-1234567890'},
    externalCart: state.cart,
    weeklyCart: false, pendingCart: false, fullWeekCart: false, ordinaryPending: false, externalPosFullAccess: false, historicalCart: false, historicalCartReady: false, historicalReason: '', externalSubtotal: 0,
    setHistoricalReason: () => {}, setHistoricalReceipt: () => {},
    creatingExternal: false,
    externalFeeReady:true,externalManualFee:false,externalFeeAmount:'',externalFeeReason:'',externalQuote:{id:'quote-1234567890',expiresAt:'2099-01-01T00:00:00Z'},
    setExternalDestination:()=>{},setExternalDestinations:()=>{},setExternalQuoteState:()=>{},
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
  scope.pendingCart = scope.weeklyCart || (scope.externalPosFullAccess && scope.ordinaryPending && !scope.fullWeekCart);
  const scoped=scope as typeof scope & {externalOrderInput?:unknown};
  scoped.externalOrderInput={workspaceId:scope.workspaceId,storeId:scope.storeId,slug:'store-a',source:scope.externalSource,customerName:scope.externalName,phone:scope.externalPhone,notes:scope.externalNotes,externalOrderNumber:scope.externalNumber,fulfilmentMethod:scope.externalMethod,deliveryAddress:scope.externalAddress,fulfilmentDate:scope.externalDate,fulfilmentTime:scope.externalTime,selections:(scope.externalCart as Array<{selection:object;quantity:number}>).map(item=>({...item.selection,quantity:item.quantity})),lineSchedules:(scope.externalCart as Array<{date?:string;time?:string}>).map(item=>({date:item.date||'',time:item.time||''}))};
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
  assert.match(modal, /creatingExternal \? 'Creating…' : historicalCart \? 'Record Historical Order' : pendingCart/);
  assert.doesNotMatch(createExternalOrderSource, /setErrorMessage\(/);
});

test('cart preview preserves option adjustments, Set upgrades, quantities and rounded subtotal', () => {
  const pricingSource = pageSource.slice(pageSource.indexOf('  const externalCartLines ='), pageSource.indexOf('\n  const externalDiscountItems ='));
  const calculate = new Function('externalCart', 'externalProducts', 'externalOptionGroups', 'externalSets', 'calculateStoreOptionAdjustedPrice', 'calculateStoreSetAnalysis', 'externalStore', 'externalDate', 'externalTime', 'externalPosFullAccess', `${pricingSource}\nreturn { externalCartLines, externalSubtotal };`);
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
  assert.match(pageSource, /onClick=\{\(\) => selectDailyView\(view\)\}/);
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

test('historical Weekly POS submits the audit reason and reviewed subtotal without printing or labelling payment', async () => {
  const requests: Record<string, unknown>[] = [];
  const receipts: string[] = [];
  const harness = makeExternalOrderHarness({
    historicalCart: true, historicalCartReady: true, historicalReason: 'Order slip', externalSubtotal: 12.5,
    setHistoricalReceipt: (id: string) => receipts.push(id),
    storeOrderService: {
      createExternalPosOrder: async (payload: Record<string, unknown>) => {
        requests.push(payload);
        return { orderId: 'audit-record', historical: true };
      },
      getOrder: async () => assert.fail('An audit record must never be treated as a paid order'),
    },
  });
  await harness.submit();
  assert.equal(requests[0].paymentLabel, undefined);
  assert.equal(requests[0].historicalReason, 'Order slip');
  assert.equal(requests[0].expectedSubtotalMinor, 1250);
  assert.deepEqual(receipts, ['audit-record']);
  assert.equal(harness.state.open, true);
  assert.equal(harness.state.printed, 0);
});

test('privileged Weekly Day cart saves one pending order with the independent menu and fulfilment dates', async () => {
  const requests: Record<string, unknown>[] = [];
  const selection = { productId: 'plan', healthyLunchPlanId: 'plan', healthyLunchDate: '2026-11-17' };
  const order = { id: 'weekly-pending', payment: { status: 'pending' } };
  const show: unknown[] = [];
  const harness = makeExternalOrderHarness({
    weeklyCart: true, externalPosFullAccess: true,
    externalSubtotal: 22, weeklyPaymentWorkflow: 'link',
    weeklyManualInput: { lines: [{ selection, date: '2026-11-21', quantity: 1 }] },
    setSavedWeeklyOrder: (value: unknown) => show.push(value), setWeeklyPaymentWorkflow: () => {},
    storeOrderService: {
      saveManualPosOrder: async (payload: Record<string, unknown>) => { requests.push(payload); return { orderId: order.id }; },
      getOrder: async () => order,
      createExternalPosOrder: async () => assert.fail('Pending Weekly orders must never use the external paid flow'),
    },
  });
  await Promise.all([harness.submit(), harness.submit()]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].expectedSubtotalMinor, 2200);
  assert.deepEqual(requests[0].lines, [{ selection, date: '2026-11-21', quantity: 1 }]);
  assert.deepEqual(show, [{ order, workflow: 'link' }]);
  assert.equal(harness.state.printed, 0);
});

test('ordinary Add Order pending/manual choices use the saved order path without a payment provider', async () => {
  for (const workflow of ['pending', 'manual']) {
    const requests: Record<string, unknown>[] = [];
    const shown: unknown[] = [];
    const order = { id: 'ordinary-pending', payment: { status: 'pending' } };
    const harness = makeExternalOrderHarness({ ordinaryPending: true, externalPosFullAccess: true,
      externalSubtotal: 36, weeklyPaymentWorkflow: workflow,
      weeklyManualInput: { posAddOrder: true, weeklyDayPos: false, lines: [{ selection: { productId: 'burger' }, quantity: 2, date: '2026-11-21', time: '12:00' }] },
      setSavedWeeklyOrder: (value: unknown) => shown.push(value), setWeeklyPaymentWorkflow: () => {},
      storeOrderService: {
        saveManualPosOrder: async (payload: Record<string, unknown>) => { requests.push(payload); return { orderId: order.id }; },
        getOrder: async () => order,
        createExternalPosOrder: async () => assert.fail('Unpaid ordinary orders must not use external Paid creation'),
      },
    });
    await Promise.all([harness.submit(), harness.submit()]);
    assert.equal(requests.length, 1); assert.equal(requests[0].posAddOrder, true);
    assert.equal(requests[0].expectedSubtotalMinor, 3600);
    assert.deepEqual(shown, [{ order, workflow }]); assert.equal(harness.state.printed, 0);
  }
});

test('adding a 5-Day Plan never silently converts a pending cart into an externally paid order', async () => {
  const harness = makeExternalOrderHarness({ ordinaryPending: true, fullWeekCart: true, externalPosFullAccess: true });
  await harness.submit();
  assert.equal(harness.requests.length, 0);
});


test('weekly cart has one fulfilment-time control while preserving line schedules and ordinary/5-Day controls', () => {
  // Render the actual cart JSX so a second time input fails this regression.
  const start = pageSource.indexOf('                  {item.weeklyDayPos && externalPosFullAccess &&');
  const end = pageSource.indexOf('                  {item.selection.setId && externalSets', start);
  assert.ok(start >= 0 && end > start);
  const compiled = ts.transpileModule(`const render = () => <>${pageSource.slice(start, end)}</>;`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const render = new Function('React', 'item', 'externalPosFullAccess', 'externalProducts', 'getWeeklyDates',
    'creatingExternal', 'setExternalCart', 'externalDate', 'externalTime', `${compiled}\nreturn render();`);
  type InputProps = { type?: string; value?: string; disabled?: boolean; children?: React.ReactNode;
    onChange?: (event: { target: { value?: string; checked?: boolean } }) => void };
  const inputs = (node: React.ReactNode): Array<React.ReactElement<InputProps>> => {
    const found: Array<React.ReactElement<InputProps>> = [];
    React.Children.forEach(node, child => {
      if (!React.isValidElement<InputProps>(child)) return;
      if (child.type === 'input') found.push(child);
      found.push(...inputs(child.props.children));
    });
    return found;
  };
  const weekly = { key: 'weekly-day', label: 'Configured meal', weeklyDayPos: true, date: '2026-11-21', time: '12:00', quantity: 2,
    selection: { productId: 'plan', healthyLunchPlanId: 'plan', healthyLunchDate: '2026-11-19', selectedMealOptions: [{ optionId: 'egg' }] } };
  const ordinary = { key: 'ordinary', label: 'Cake', date: '2026-11-22', time: '13:00', quantity: 1,
    selection: { productId: 'cake' } };
  let cart = [weekly, ordinary];
  const update = (change: (current: typeof cart) => typeof cart) => { cart = change(cart); };
  const products = [{ id: 'plan', productType: 'weekly_meal_plan' }, { id: 'cake', productType: 'single' }];
  const draw = (item: object, busy = false) => render(React, item, true, products, getWeeklyDates, busy, update, '2026-11-23', '11:00') as React.ReactNode;
  const row = draw(weekly);
  const fields = inputs(row);
  const times = fields.filter(field => field.props.type === 'time');
  assert.equal(times.length, 1);
  assert.equal((renderToStaticMarkup(<>{row}</>).match(/type="time"/g) || []).length, 1);
  assert.equal(times[0].props.value, '12:00');
  const undatedWeeklyTimes = inputs(draw({ ...weekly, date: '' })).filter(field => field.props.type === 'time');
  assert.equal(undatedWeeklyTimes.length, 1);
  assert.equal(undatedWeeklyTimes[0].props.value, '12:00');
  assert.equal(inputs(draw(weekly, true)).find(field => field.props.type === 'time')?.props.disabled, true);
  times[0].props.onChange!({ target: { value: '15:37' } });
  assert.equal(cart[0].time, '15:37');
  assert.equal(cart[0].date, '2026-11-21');
  assert.deepEqual(cart[0].selection, weekly.selection);
  assert.equal(cart[1], ordinary);
  fields.find(field => field.props.type === 'date')!.props.onChange!({ target: { value: '2026-11-22' } });
  assert.equal(cart[0].date, '2026-11-22');
  assert.equal(cart[0].time, '15:37');
  assert.deepEqual(cart[0].selection, weekly.selection);
  assert.equal(cart[0].quantity, 2);
  const ordinaryFields = inputs(draw(ordinary));
  assert.equal(ordinaryFields.filter(field => field.props.type === 'date').length, 1);
  assert.equal(ordinaryFields.filter(field => field.props.type === 'time').length, 1);
  const planFields = inputs(draw({ ...weekly, weeklyDayPos: false, date: '2026-11-23', selection: { productId: 'plan' } }));
  assert.equal(planFields.filter(field => field.props.type === 'date').length, 0);
  assert.equal(planFields.filter(field => field.props.type === 'time').length, 1);
});


test('POS Live History opens the existing unified browser while operational periods stay on the kitchen board', () => {
  const source = pageSource.slice(pageSource.indexOf('  const selectDailyView ='), pageSource.indexOf('  const openCompletedHistory ='));
  assert.ok(source.length > 0);
  const compiled = ts.transpileModule(source + '\nreturn selectDailyView;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const selected: string[] = [];
  let historyOpened = 0;
  const resetDates: string[] = [];
  const select = new Function('setDailyView', 'openHistory', 'setUpcomingDate', 'shiftDateKey', 'todayKey', compiled)((view: string) => selected.push(view), () => { historyOpened++; }, (date: string) => resetDates.push(date), (date: string, days: number) => days === 1 ? '2026-11-26' : date, '2026-11-25');
  for (const view of ['Today', 'Tomorrow', 'Upcoming']) select(view);
  assert.deepEqual(selected, ['Today', 'Tomorrow', 'Upcoming']);
  assert.equal(historyOpened, 0);
  assert.deepEqual(resetDates, ['2026-11-26']);
  select('History');
  assert.equal(historyOpened, 1);
  assert.deepEqual(selected, ['Today', 'Tomorrow', 'Upcoming']);
});
