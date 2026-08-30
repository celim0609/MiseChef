import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGroupKitchenEntries } from './groupKitchenOrderModel';
import type { StoreOrder } from './types';

const order = ({
  id,
  groupId = '',
  hostId = 'host-a',
  hostName = 'Host A',
  groupName = 'Office Lunch',
  shareCode = 'similar-code',
  customerName = id,
  createdAt,
  paymentStatus = 'paid',
  fulfilmentStatus = 'New',
  productName = 'Set A',
  drink = 'Teh O',
  optionName = '',
  notes = '',
  pickupDate = '2026-09-01',
  pickupSession = '7:45 AM',
  pickupLocationName = 'Counter'
}: {
  id: string;
  groupId?: string;
  hostId?: string;
  hostName?: string;
  groupName?: string;
  shareCode?: string;
  customerName?: string;
  createdAt: string;
  paymentStatus?: StoreOrder['payment']['status'];
  fulfilmentStatus?: StoreOrder['fulfilmentStatus'];
  productName?: string;
  drink?: string;
  optionName?: string;
  notes?: string;
  pickupDate?: string;
  pickupSession?: string;
  pickupLocationName?: string;
}) => ({
  id,
  orderNumber: `MC-${id}`,
  storeId: 'store-a',
  workspaceId: 'workspace-a',
  orderSource: 'online',
  ...(groupId ? { groupOrder: { id: groupId, shareCode, name: groupName, hostId, hostName, rewardPercent: 5 } } : {}),
  customerName,
  pickupDate,
  pickupSession,
  pickupLocationId: 'counter',
  pickupLocationName,
  notes,
  fulfilmentStatus,
  paymentMethodId: 'touch_n_go_qr',
  payment: { status: paymentStatus },
  items: [{
    productId: `${id}-set`, productName, quantity: 1,
    selectedOptions: optionName ? [{ groupId: 'addon', groupName: 'Add-on', optionId: `${id}-option`, optionName, priceAdjustment: 1 }] : [],
    setSnapshot: {
      setId: `${id}-set`, setName: productName, category: 'Meal', baseSetPrice: 10,
      regularValue: 10, customerSaving: 0,
      selectedGroups: [{ groupId: 'drink', groupName: 'Drink', productId: `${id}-drink`, productName: drink, standalonePrice: 2, priceAdjustment: 0 }]
    }
  }],
  createdAt
}) as StoreOrder;

test('same immutable Group id renders one card with stable separate member snapshots', () => {
  const customerB = order({ id: 'b', groupId: 'group-exact', customerName: 'Customer B', createdAt: '2026-09-01T02:00:00.000Z', drink: 'Teh O Ice', optionName: 'Extra egg' });
  const customerA = order({ id: 'a', groupId: 'group-exact', customerName: 'Customer A', createdAt: '2026-09-01T01:00:00.000Z', drink: 'Teh O', optionName: 'No cucumber', notes: 'No sambal' });
  const [entry] = buildGroupKitchenEntries([customerB, customerA], 'New');
  assert.equal(entry.kind, 'group');
  if (entry.kind !== 'group') return;
  assert.deepEqual(entry.members.map(member => [member.position, member.total, member.order.customerName]), [[1, 2, 'Customer A'], [2, 2, 'Customer B']]);
  assert.equal(entry.members[0].order.items[0].setSnapshot?.selectedGroups[0].productName, 'Teh O');
  assert.equal(entry.members[0].order.notes, 'No sambal');
  assert.equal(entry.members[0].order.items[0].selectedOptions[0].optionName, 'No cucumber');
  assert.equal(entry.members[1].order.items[0].setSnapshot?.selectedGroups[0].productName, 'Teh O Ice');
  assert.equal(entry.members[1].order.items[0].selectedOptions[0].optionName, 'Extra egg');
  assert.equal(entry.members[1].order.notes, '');
});

test('same Host, pickup, similar names, and similar codes never combine different full Group ids', () => {
  const entries = buildGroupKitchenEntries([
    order({ id: 'a', groupId: 'group-full-a', groupName: 'Team Lunch', shareCode: 'same-prefix-a', createdAt: '2026-09-01T01:00:00.000Z' }),
    order({ id: 'b', groupId: 'group-full-b', groupName: 'Team Lunch!', shareCode: 'same-prefix-b', createdAt: '2026-09-01T02:00:00.000Z' })
  ], 'New');
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map(entry => entry.kind === 'group' ? entry.groupId : '').sort(), ['group-full-a', 'group-full-b']);
});

test('Host A and Host B identity conflict fails safe to independent underlying orders', () => {
  const entries = buildGroupKitchenEntries([
    order({ id: 'a', groupId: 'corrupt-shared-id', hostId: 'host-a', createdAt: '2026-09-01T01:00:00.000Z' }),
    order({ id: 'b', groupId: 'corrupt-shared-id', hostId: 'host-b', createdAt: '2026-09-01T02:00:00.000Z' })
  ], 'New');
  assert.deepEqual(entries.map(entry => entry.kind), ['order', 'order']);
});

test("Host A's members never appear in Host B's exact Group card", () => {
  const entries = buildGroupKitchenEntries([
    order({ id: 'host-a-member', groupId: 'host-a-group', hostId: 'host-a', hostName: 'Host A', createdAt: '2026-09-01T01:00:00.000Z' }),
    order({ id: 'host-b-member', groupId: 'host-b-group', hostId: 'host-b', hostName: 'Host B', createdAt: '2026-09-01T01:00:00.000Z' })
  ], 'New');
  const hostB = entries.find(entry => entry.kind === 'group' && entry.groupId === 'host-b-group');
  assert.equal(hostB?.kind, 'group');
  if (hostB?.kind !== 'group') return;
  assert.deepEqual(hostB.members.map(member => member.order.id), ['host-b-member']);
});

test('normal and missing or ambiguous Group ids render independently', () => {
  const normal = order({ id: 'normal', createdAt: '2026-09-01T03:00:00.000Z' });
  const malformed = order({ id: 'malformed', groupId: ' group-a', createdAt: '2026-09-01T04:00:00.000Z' });
  const entries = buildGroupKitchenEntries([normal, malformed], 'New');
  assert.deepEqual(entries.map(entry => entry.kind), ['order', 'order']);
});

test('payment changes do not change exact Group membership, numbering, or denominator', () => {
  const early = order({ id: 'early', groupId: 'group-a', createdAt: '2026-09-01T01:00:00.000Z', paymentStatus: 'pending_verification' });
  const later = order({ id: 'later', groupId: 'group-a', createdAt: '2026-09-01T02:00:00.000Z' });
  const other = order({ id: 'other', groupId: 'group-b', createdAt: '2026-09-01T01:30:00.000Z' });
  const before = buildGroupKitchenEntries([later, other, early], 'New');
  const after = buildGroupKitchenEntries([{ ...early, payment: { ...early.payment, status: 'paid' } }, later, other], 'New');
  const groupBefore = before.find(entry => entry.kind === 'group' && entry.groupId === 'group-a');
  const groupAfter = after.find(entry => entry.kind === 'group' && entry.groupId === 'group-a');
  assert.ok(groupBefore?.kind === 'group' && groupAfter?.kind === 'group');
  assert.deepEqual(groupBefore.members.map(member => [member.order.id, member.position, member.total]), [['early', 1, 2], ['later', 2, 2]]);
  assert.deepEqual(groupAfter.members.map(member => [member.order.id, member.position, member.total]), [['early', 1, 2], ['later', 2, 2]]);
  assert.equal(groupBefore.members[0].actionable, false);
  assert.equal(groupAfter.members[0].actionable, true);
});

test('a later exact-id member appends without renumbering existing members', () => {
  const first = order({ id: 'first', groupId: 'group-a', createdAt: '2026-09-01T01:00:00.000Z' });
  const second = order({ id: 'second', groupId: 'group-a', createdAt: '2026-09-01T02:00:00.000Z' });
  const third = order({ id: 'third', groupId: 'group-a', createdAt: '2026-09-01T03:00:00.000Z' });
  const before = buildGroupKitchenEntries([second, first], 'New')[0];
  const after = buildGroupKitchenEntries([third, second, first], 'New')[0];
  assert.ok(before.kind === 'group' && after.kind === 'group');
  assert.deepEqual(before.members.map(member => [member.order.id, member.position]), [['first', 1], ['second', 2]]);
  assert.deepEqual(after.members.map(member => [member.order.id, member.position]), [['first', 1], ['second', 2], ['third', 3]]);
});

test('member ordering falls back deterministically to order number and then document id', () => {
  const createdAt = '2026-09-01T01:00:00.000Z';
  const z = order({ id: 'z', groupId: 'group-a', createdAt });
  const a = order({ id: 'a', groupId: 'group-a', createdAt });
  const b = { ...order({ id: 'b', groupId: 'group-a', createdAt }), orderNumber: a.orderNumber };
  const entry = buildGroupKitchenEntries([z, b, a], 'New')[0];
  assert.equal(entry.kind, 'group');
  if (entry.kind !== 'group') return;
  assert.deepEqual(entry.members.map(member => member.order.id), ['a', 'b', 'z']);
});

test('mixed Group stages select one batch action from the earliest eligible paid stage', () => {
  const members = [
    order({ id: 'new', groupId: 'group-a', createdAt: '2026-09-01T01:00:00.000Z', fulfilmentStatus: 'New' }),
    order({ id: 'preparing', groupId: 'group-a', createdAt: '2026-09-01T02:00:00.000Z', fulfilmentStatus: 'Preparing' }),
    order({ id: 'ready', groupId: 'group-a', createdAt: '2026-09-01T03:00:00.000Z', fulfilmentStatus: 'Ready' }),
    order({ id: 'pending', groupId: 'group-a', createdAt: '2026-09-01T04:00:00.000Z', paymentStatus: 'pending_verification' }),
    order({ id: 'cancelled', groupId: 'group-a', createdAt: '2026-09-01T05:00:00.000Z', fulfilmentStatus: 'Cancelled' }),
    order({ id: 'completed', groupId: 'group-a', createdAt: '2026-09-01T06:00:00.000Z', fulfilmentStatus: 'Completed' })
  ];
  const entry = buildGroupKitchenEntries(members, 'New')[0];
  assert.equal(entry.kind, 'group');
  if (entry.kind !== 'group') return;
  assert.equal(entry.batchAction, 'start_preparing');
  assert.equal(entry.memberCount, 6);
  assert.equal(entry.paidOrderCount, 5);
  assert.equal(entry.eligibleOrderCount, 3);
  assert.equal(entry.awaitingPaymentCount, 1);
  assert.deepEqual(entry.members.map(member => member.order.id), members.map(member => member.id));
});

test('Group action progresses from Preparing to Ready to Completed without merging members', () => {
  const preparing = [
    order({ id: 'a', groupId: 'group-a', createdAt: '2026-09-01T01:00:00.000Z', fulfilmentStatus: 'Preparing' }),
    order({ id: 'b', groupId: 'group-a', createdAt: '2026-09-01T02:00:00.000Z', fulfilmentStatus: 'Ready' })
  ];
  const preparingEntry = buildGroupKitchenEntries(preparing, 'Preparing')[0];
  assert.equal(preparingEntry.kind === 'group' ? preparingEntry.batchAction : null, 'mark_ready');

  const ready = preparing.map(member => ({ ...member, fulfilmentStatus: 'Ready' as const }));
  const readyEntry = buildGroupKitchenEntries(ready, 'Ready')[0];
  assert.equal(readyEntry.kind === 'group' ? readyEntry.batchAction : null, 'complete');
  assert.deepEqual(
    readyEntry.kind === 'group' ? readyEntry.members.map(member => member.order.id) : [],
    ['a', 'b']
  );
});

test('an unpaid unresolved Group remains visible without exposing a batch action', () => {
  const entry = buildGroupKitchenEntries([
    order({ id: 'pending', groupId: 'group-a', createdAt: '2026-09-01T01:00:00.000Z', paymentStatus: 'pending_verification' })
  ], 'New')[0];
  assert.equal(entry.kind, 'group');
  if (entry.kind !== 'group') return;
  assert.equal(entry.batchAction, null);
  assert.equal(entry.awaitingPaymentCount, 1);
  assert.equal(entry.eligibleOrderCount, 0);
});

test('Group cards sort by pickup date and configured Store session order', () => {
  const entries = buildGroupKitchenEntries([
    order({ id: 'later-date', groupId: 'later-date', createdAt: '2026-08-01T01:00:00.000Z', pickupDate: '2026-09-02', pickupSession: 'Breakfast' }),
    order({ id: 'later-session', groupId: 'later-session', createdAt: '2026-08-03T01:00:00.000Z', pickupDate: '2026-09-01', pickupSession: 'Lunch' }),
    order({ id: 'earlier-session', groupId: 'earlier-session', createdAt: '2026-08-02T01:00:00.000Z', pickupDate: '2026-09-01', pickupSession: 'Breakfast' })
  ], 'New', ['Breakfast', 'Lunch']);
  assert.deepEqual(
    entries.map(entry => entry.kind === 'group' ? entry.groupId : ''),
    ['earlier-session', 'later-session', 'later-date']
  );
});
