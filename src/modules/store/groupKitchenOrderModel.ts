import { isOrderOperationallyEligible, toActivePosStatus, type ActivePosStatus } from './posOrderModel';
import type { StoreOrder } from './types';

export type GroupKitchenMember = {
  order: StoreOrder;
  position: number;
  total: number;
  actionable: boolean;
};

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

export const buildGroupKitchenEntries = (
  orders: StoreOrder[],
  columnStatus: ActivePosStatus
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
      .map(activeStatus)
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
    const leftCreatedAt = left.kind === 'order' ? left.order.createdAt : left.members[0]?.order.createdAt || '';
    const rightCreatedAt = right.kind === 'order' ? right.order.createdAt : right.members[0]?.order.createdAt || '';
    return rightCreatedAt.localeCompare(leftCreatedAt) || left.key.localeCompare(right.key);
  });
};
