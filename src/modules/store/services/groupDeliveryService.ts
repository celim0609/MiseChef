import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase';
import type { MealOptionGroup } from '../types';

export type DeliveryLunch = { productId: string; name: string; price: number; photoUrl: string; portionsPerUnit: number; optionGroups: MealOptionGroup[] };
export type DeliveryProgress = { available: boolean; dates?: string[]; date?: string; areaName?: string; centerAddress?: string; minimumPortions?: number;
  joinedPortions?: number; closesAt?: string; status?: 'collecting' | 'ready_for_review' | 'closed'; menu?: DeliveryLunch[]; sharePath?: string;
  mine?: { status: 'reserved' | 'cancelled' | 'expired'; portions: number; expiresAt: string } | null };
export type DeliverySelection = { productId: string; quantity: number; selectedMealOptions?: { serviceDate: string; optionGroupId: string; optionId: string }[] };
async function call<T>(name: string, data: unknown): Promise<T> {
  if (!functions) throw new Error('Group Delivery unavailable. / 团购配送暂不可用。');
  return (await httpsCallable<unknown, T>(functions, name)(data)).data;
}
export type GroupDeliveryConfig = { enabled: boolean; dates: Record<string, { closesAt: string }>; eligibleProducts: Record<string, number> };
export type GroupDeliveryManagerData = { config: GroupDeliveryConfig; dates: string[]; products: { productId: string; name: string }[] };
export const groupDeliveryService = {
  configuration: (slug: string) => call<GroupDeliveryManagerData>('getMiseChefGroupDeliveryConfiguration', { slug }),
  configure: (slug: string, config: GroupDeliveryConfig) => call('configureMiseChefGroupDelivery', { slug, config }),
  get: (slug: string, date = '') => call<DeliveryProgress>('getMiseChefGroupDelivery', { slug, date }),
  search: (input: string, sessionToken: string, language: string) => call<{ suggestions: { placeId: string; label: string }[] }>('searchMiseChefGroupDeliveryAddresses', { input, sessionToken, language }),
  check: (placeId: string) => call<{ eligible: boolean; distanceMetres: number; formattedAddress: string }>('checkMiseChefGroupDeliveryAddress', { placeId }),
  reserve: (slug: string, reservation: { date: string; selections: DeliverySelection[]; placeId: string; name: string; phone: string; unit: string; requestId: string }) => call<{ status: string }>('reserveMiseChefGroupDelivery', { slug, reservation }),
  cancel: (slug: string, date: string) => call('cancelMiseChefGroupDeliveryReservation', { slug, date })
};
