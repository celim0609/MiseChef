import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase';
import type { MealOptionGroup, StorePaymentSession } from '../types';

export type DeliveryLunch = { productId: string; name: string; price: number; photoUrl: string; portionsPerUnit: number; optionGroups: MealOptionGroup[] };
export type DeliveryProgress = { available: boolean; dates?: string[]; date?: string; areaName?: string; areaId?: string; areas?: Array<{areaId:string;areaName:string}>; centerAddress?: string; minimumPortions?: number;
  deliveryWindow?: { start: string; end: string }; joinedPortions?: number; paidPortions?: number; paymentMethods?: Array<'stripe' | 'curlec'>; canChooseFallback?: boolean; closesAt?: string; status?: 'collecting' | 'ready_for_review' | 'closed' | 'approved'; menu?: DeliveryLunch[]; sharePath?: string;
  mine?: { paymentConfirmed?: boolean; mealReleased?: boolean; checkoutLinked?: boolean; cancellationRequested?: boolean; status: 'reserved' | 'cancelled' | 'expired'; portions: number; expiresAt: string } | null };
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
  get: (slug: string, date = '', areaId?: string) => call<DeliveryProgress>('getMiseChefGroupDelivery', { slug, date, areaId }),
  search: (input: string, sessionToken: string, language: string) => call<{ suggestions: { placeId: string; label: string }[] }>('searchMiseChefGroupDeliveryAddresses', { input, sessionToken, language }),
  check: (placeId: string, areaId?: string) => call<{ eligible: boolean; distanceMetres: number; formattedAddress: string }>('checkMiseChefGroupDeliveryAddress', { placeId, areaId }),
  reserve: (slug: string, reservation: { date: string; areaId?: string; selections: DeliverySelection[]; placeId: string; name: string; phone: string; unit: string; requestId: string }) => call<{ status: string }>('reserveMiseChefGroupDelivery', { slug, reservation }),
  checkout: (slug: string, groupDelivery: { date: string; areaId?: string; paymentMethodId: string; customerEmail: string }, returnUrl: string) =>
    call<StorePaymentSession>('createPublicStorePayment', { slug, groupDelivery, returnUrl }),
  quoteFallback: (slug: string, date: string, areaId: string | undefined, time: string) =>
    call<{ customerDeliveryFee: number; expiresAt: string; currency: string }>('quoteMiseChefGroupDeliveryFallback', { slug, date, areaId, time }),
  requestCancellation: (slug: string, date: string, areaId?: string) =>
    call<{ requested: boolean }>('requestMiseChefGroupDeliveryCancellation', { slug, date, areaId }),
  cancel: (slug: string, date: string, areaId?: string) => call('cancelMiseChefGroupDeliveryReservation', { slug, date, areaId })
};
