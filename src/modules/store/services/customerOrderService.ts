import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase';
import type { CustomerStoreOrderSummary } from '../types';

export const customerOrderService = {
  async listMine(): Promise<CustomerStoreOrderSummary[]> {
    if (!functions) throw new Error('Your orders are temporarily unavailable.');
    const response = await httpsCallable<undefined, { orders: CustomerStoreOrderSummary[] }>(
      functions,
      'listMyMiseChefStoreOrders'
    )();
    return response.data.orders;
  }
};
