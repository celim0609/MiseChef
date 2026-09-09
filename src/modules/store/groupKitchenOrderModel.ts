import { isOrderOperationallyEligible, toActivePosStatus, type ActivePosStatus } from './posOrderModel';
import type { StoreOrder } from './types';

export type GroupKitchenMember = {
  order: StoreOrder;
  position: number;
  total: number;
  actionable: boolean;
};

export type GroupKitchenBatchAction = 'start_preparing' | 'mark_ready' | 'complete';

export type GroupKitchenEntry =
  | { kind: 'order'; key: string; order: StoreOrder }
  | {
    kind: 'group';
    key: string;
    groupId: string;
    groupName: string;
    hostName: string;
    pickupDate: string;
    pickupSession: string;
    pickupLocationName: string;
    memberCount: number;
    paidOrderCount: number;
    eligibleOrderCount: number;
    awaitingPaymentCount: number;
    batchAction: GroupKitchenBatchAction | null;
    members: GroupKitchenMember[];
  };

const STATUS_RANK: Record<ActivePosStatus, number> = { New: 0, Preparing: 1, Ready: 2 };

const compareMembers = (left: StoreOrder, right: StoreOrder) => (
  left.createdAt.localeCompare(right.createdAt)
  || left.orderNumber.localeCompare(right.orderNumber)
  || left.id.localeCompare(right.id)
);

const exactGroupId = (order: StoreOrder) => {
  const value = order.groupOrder?.id;
  return typeof value === 'string' && value.length > 0 && value === value.trim() ? value : '';
};

const hasConsistentIdentity = (orders: StoreOrder[]) => {
  const first = orders[0];
  if (!first?.groupOrder?.hostId) return false;
  return orders.every(order => (
    exactGroupId(order) === exactGroupId(first)
    && order.groupOrder?.hostId === first.groupOrder?.hostId
    && order.storeId === first.storeId
    && order.workspaceId === first.workspaceId
    && order.pickupDate === first.pickupDate
    && order.pickupSession === first.pickupSession
    && order.pickupLocationId === first.pickupLocationId
  ));
};

const activeStatus = (order: StoreOrder) => (
  isOrderOperationallyEligible(order) ? toActivePosStatus(order.fulfilmentStatus) : null
);

const paidBatchStatus = (order: StoreOrder): ActivePosStatus | null => {
  if (order.payment.status !== 'paid') return null;
  return order.fulfilmentStatus === 'New'
    || order.fulfilmentStatus === 'Preparing'
    || order.fulfilmentStatus === 'Ready'
    ? order.fulfilmentStatus
    : null;
};

const actionForStage = (status: ActivePosStatus): GroupKitchenBatchAction => ({
  New: 'start_preparing',
  Preparing: 'mark_ready',
  Ready: 'complete'
})[status] as GroupKitchenBatchAction;

const compareGroupPickup = (
  left: Extract<GroupKitchenEntry, { kind: 'group' }>,
  right: Extract<GroupKitchenEntry, { kind: 'group' }>,
  pickupSessions: string[]
) => {
  const leftDate = left.pickupDate || '\uffff';
  const rightDate = right.pickupDate || '\uffff';
  const dateOrder = leftDate.localeCompare(rightDate);
  if (dateOrder) return dateOrder;
  const sessionRank = (session: string) => {
    const index = pickupSessions.indexOf(session);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  return sessionRank(left.pickupSession) - sessionRank(right.pickupSession)
    || left.pickupSession.localeCompare(right.pickupSession)
    || left.key.localeCompare(right.key);
};

export const buildGroupKitchenEntries = (
  orders: StoreOrder[],
  columnStatus: ActivePosStatus,
  pickupSessions: string[] = []
): GroupKitchenEntry[] => {
  const candidateGroups = new Map<string, StoreOrder[]>();
  const independentOrders: StoreOrder[] = [];

  for (const order of orders) {
    const groupId = exactGroupId(order);
    if (!groupId) {
      independentOrders.push(order);
      continue;
    }
    const members = candidateGroups.get(groupId) || [];
    members.push(order);
    candidateGroups.set(groupId, members);
  }

  const entries: GroupKitchenEntry[] = [];
  for (const [groupId, candidateMembers] of candidateGroups) {
    if (!hasConsistentIdentity(candidateMembers)) {
      independentOrders.push(...candidateMembers);
      continue;
    }

    const members = [...candidateMembers].sort(compareMembers);
    const activeStages = members
      .map(paidBatchStatus)
      .filter((status): status is ActivePosStatus => Boolean(status))
      .sort((left, right) => STATUS_RANK[left] - STATUS_RANK[right]);
    const hasUnresolvedMember = members.some(order => (
      order.fulfilmentStatus !== 'Completed' && order.fulfilmentStatus !== 'Cancelled'
    ));
    const groupStage = activeStages[0] || (hasUnresolvedMember ? 'New' : null);
    if (groupStage !== columnStatus) continue;

    const first = members[0];
    entries.push({
      kind: 'group',
      key: `group:${groupId}`,
      groupId,
      groupName: first.groupOrder?.name || 'Group Order',
      hostName: first.groupOrder?.hostName || 'Host',
      pickupDate: first.pickupDate,
      pickupSession: first.pickupSession,
      pickupLocationName: first.pickupLocationName,
      memberCount: members.length,
      paidOrderCount: members.filter(order => order.payment.status === 'paid').length,
      eligibleOrderCount: activeStages.length,
      awaitingPaymentCount: members.filter(order => (
        order.payment.status !== 'paid'
        && order.fulfilmentStatus !== 'Cancelled'
        && order.fulfilmentStatus !== 'Completed'
      )).length,
      batchAction: activeStages.length > 0 ? actionForStage(groupStage as ActivePosStatus) : null,
      members: members.map((order, index) => ({
        order,
        position: index + 1,
        total: members.length,
        actionable: activeStatus(order) === groupStage
      }))
    });
  }

  for (const order of independentOrders) {
    if (activeStatus(order) === columnStatus) {
      entries.push({ kind: 'order', key: `order:${order.id}`, order });
    }
  }

  return entries.sort((left, right) => {
    if (left.kind === 'group' && right.kind === 'group') {
      return compareGroupPickup(left, right, pickupSessions);
    }
    if (left.kind === 'group') return -1;
    if (right.kind === 'group') return 1;
    return right.order.createdAt.localeCompare(left.order.createdAt) || left.key.localeCompare(right.key);
  });
};
