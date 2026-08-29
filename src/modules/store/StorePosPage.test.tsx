import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pageSource = readFileSync(new URL('./StorePosPage.tsx', import.meta.url), 'utf8');
const serviceSource = readFileSync(new URL('./services/storeOrderService.ts', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
const groupKitchenSource = readFileSync(new URL('./groupKitchenOrderModel.ts', import.meta.url), 'utf8');

test('POS prioritizes three active kitchen columns and moves Completed to a compact summary', () => {
  for (const label of ['New', 'Preparing', 'Ready']) {
    assert.match(pageSource, new RegExp(`label: '${label}'`));
  }
  assert.doesNotMatch(pageSource, /status: 'Completed', label: 'Completed'/);
  assert.match(pageSource, /completedTodayCount/);
  assert.match(pageSource, /View Completed/);
  assert.match(pageSource, /<audio ref=\{audioRef\}/);
  assert.match(pageSource, /grid-cols-\[1\.1fr_1\.1fr_0\.9fr\]/);
});

test('POS extends the shared realtime service with a tenant-safe ordered Store query', () => {
  assert.match(serviceSource, /subscribePosOrders/);
  assert.match(serviceSource, /where\('storeId', '==', storeId\)/);
  assert.match(serviceSource, /where\('workspaceId', '==', workspaceId\)/);
  assert.match(serviceSource, /orderBy\('createdAt', 'desc'\)/);
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
  assert.match(serviceSource, /subscribeCompletedOrders/);
  assert.match(pageSource, /isOrderCompletedOnMalaysiaDate/);
  assert.match(pageSource, /openCompletedHistory/);
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

test('Group Kitchen cards use exact Group ids and preserve per-order fulfilment actions', () => {
  assert.match(pageSource, /buildGroupKitchenEntries\(orders, column\.status\)/);
  assert.match(pageSource, /data-group-order-id=\{entry\.groupId\}/);
  assert.match(pageSource, /data-store-order-id=\{order\.id\}/);
  assert.match(pageSource, /member\.position.*member\.total.*order\.customerName/s);
  assert.match(pageSource, /formatStoreOrderSetSelection/);
  assert.match(pageSource, /option\.groupName.*option\.optionName/s);
  assert.match(pageSource, /Remark: \{order\.notes\}/);
  assert.match(pageSource, /advanceOrder\(order\)/);
  assert.doesNotMatch(pageSource, /advanceGroup|completeGroup|fulfilGroup/);
  assert.match(groupKitchenSource, /candidateGroups\.get\(groupId\)/);
  assert.doesNotMatch(groupKitchenSource, /groupOrder\?\.name.*Map|hostName.*Map|pickupSession.*Map/);
});
