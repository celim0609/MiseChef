import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase';
import type { CartSelection, DraftFulfilment } from '../types';

const getFunctions = () => {
  if (!functions) throw new Error('Delivery is temporarily unavailable. Please refresh and try again.');
  return functions;
};

export type DeliveryDestination = { formattedAddress: string; latitude: string; longitude: string; deliveryInstructions?: string };
export type DeliveryQuote = { quote: { quotationId: string; expiresAt: string; customerDeliveryFee: number; currency: 'MYR'; minimumValidityMs: number; firstDayFee?: number; fulfilmentCount?: number }; pricingSnapshotId: string; merchandiseSubtotal: number; destination: { address: string; latitude: string; longitude: string; instructions: string } };

export const storeDeliveryService = {
  async quote(slug: string, selections: CartSelection[], destination: DeliveryDestination, deliveryDate: string, deliveryTime: string, fulfilmentMode: 'preorder' | 'instant' = 'preorder', fulfilments?: DraftFulfilment[]): Promise<DeliveryQuote> {
    const call = httpsCallable<{ slug: string; delivery: { selections: CartSelection[]; destination: DeliveryDestination; deliveryDate: string; deliveryTime: string; fulfilmentMode: 'preorder' | 'instant'; fulfilments?: DraftFulfilment[] } }, DeliveryQuote>(getFunctions(), 'createPublicStoreDeliveryQuote');
    return (await call({ slug, delivery: { selections, destination, deliveryDate, deliveryTime, fulfilmentMode, ...(fulfilments ? { fulfilments } : {}) } })).data;
  },
  async dispatch(orderId: string, fulfilmentId?: string): Promise<{ status: string; orderId?: string; difference?: number }> {
    const call = httpsCallable<{ orderId: string; fulfilmentId?: string }, { status: string; orderId?: string; difference?: number }>(getFunctions(), 'dispatchStoreLalamoveDelivery');
    return (await call({ orderId, ...(fulfilmentId ? { fulfilmentId } : {}) })).data;
  },
  async cancel(orderId: string, fulfilmentId?: string): Promise<{ status: string }> {
    const call = httpsCallable<{ orderId: string; fulfilmentId?: string }, { status: string }>(getFunctions(), 'cancelStoreLalamoveDelivery');
    return (await call({ orderId, ...(fulfilmentId ? { fulfilmentId } : {}) })).data;
  },
  async refresh(orderId: string, fulfilmentId?: string): Promise<{ status: string; lifecycleState?: string }> {
    const call = httpsCallable<{ orderId: string; fulfilmentId?: string }, { status: string; lifecycleState?: string }>(getFunctions(), 'refreshStoreLalamoveDelivery');
    return (await call({ orderId, ...(fulfilmentId ? { fulfilmentId } : {}) })).data;
  },
  async cityInfo(workspaceId: string): Promise<string[]> {
    const call = httpsCallable<{ workspaceId: string }, Array<{ services?: Array<{ key?: string }> }>>(getFunctions(), 'getStoreLalamoveSandboxCityInfo');
    const cities = (await call({ workspaceId })).data;
    return [...new Set(cities.flatMap(city => (city.services || []).map(service => service.key || '')).filter(Boolean))];
  }
};
