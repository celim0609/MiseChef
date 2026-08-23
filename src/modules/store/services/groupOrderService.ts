import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase';
import type { HostGroupOrder, PublicGroupOrder } from '../types';

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
  }
};
