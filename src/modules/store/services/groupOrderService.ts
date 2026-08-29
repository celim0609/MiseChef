import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase';
import type { HostGroupOrder, HostGroupOrderSummary, PublicGroupOrder } from '../types';

const requireFunctions = () => {
  if (!functions) throw new Error('The Host Program is temporarily unavailable.');
  return functions;
};

export const groupOrderService = {
  async activateHost(): Promise<void> {
    await httpsCallable(requireFunctions(), 'activateMiseChefHost')({});
  },

  async create(slug: string, group: {
    name: string;
    pickupDate: string;
    pickupSession: string;
    pickupLocationId: string;
    closesAt: string;
  }): Promise<{ groupId: string; shareCode: string }> {
    const response = await httpsCallable<
      { slug: string; group: typeof group },
      { groupId: string; shareCode: string }
    >(requireFunctions(), 'createMiseChefGroupOrder')({ slug, group });
    return response.data;
  },

  async getPublic(shareCode: string): Promise<PublicGroupOrder> {
    const response = await httpsCallable<
      { shareCode: string },
      PublicGroupOrder
    >(requireFunctions(), 'getPublicMiseChefGroupOrder')({ shareCode });
    return response.data;
  },

  async listMine(slug: string): Promise<{ hostActive: boolean; groups: HostGroupOrder[] }> {
    const response = await httpsCallable<
      { slug: string },
      { hostActive: boolean; groups: HostGroupOrder[] }
    >(requireFunctions(), 'listMyMiseChefGroupOrders')({ slug });
    return response.data;
  },

  async getMine(groupId: string): Promise<{ group: HostGroupOrder; orders: HostGroupOrderSummary[] }> {
    const response = await httpsCallable<
      { groupId: string },
      { group: HostGroupOrder; orders: HostGroupOrderSummary[] }
    >(requireFunctions(), 'getMyMiseChefGroupOrder')({ groupId });
    return response.data;
  },

  async updateStatus(groupId: string, nextStatus: 'closed' | 'cancelled'): Promise<{ groupId: string; status: 'closed' | 'cancelled' }> {
    const response = await httpsCallable<
      { groupId: string; nextStatus: 'closed' | 'cancelled' },
      { groupId: string; status: 'closed' | 'cancelled' }
    >(requireFunctions(), 'updateMyMiseChefGroupOrderStatus')({ groupId, nextStatus });
    return response.data;
  },

  async cleanup(groupId: string, action: 'delete' | 'archive'): Promise<{ groupId: string; action: 'deleted' | 'archived' }> {
    const response = await httpsCallable<
      { groupId: string; action: 'delete' | 'archive' },
      { groupId: string; action: 'deleted' | 'archived' }
    >(requireFunctions(), 'cleanupMyMiseChefGroupOrder')({ groupId, action });
    return response.data;
  }
};
