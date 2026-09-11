import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase';
import type { CartSelection } from '../types';

const getFunctions = () => {
  if (!functions) throw new Error('Delivery is temporarily unavailable. Please refresh and try again.');
  return functions;
};

export type DeliveryDestination = { formattedAddress: string; latitude: string; longitude: string; deliveryInstructions?: string };
export type DeliveryQuote = { quote: { quotationId: string; expiresAt: string; customerDeliveryFee: number; currency: 'MYR' }; merchandiseSubtotal: number; destination: DeliveryDestination };

export const storeDeliveryService = {
  async quote(slug: string, selections: CartSelection[], destination: DeliveryDestination, deliveryDate: string, deliverySession: string, fulfilmentMode: 'preorder' | 'instant' = 'preorder'): Promise<DeliveryQuote> {
    const call = httpsCallable<{ slug: string; delivery: { selections: CartSelection[]; destination: DeliveryDestination; deliveryDate: string; deliverySession: string; fulfilmentMode: 'preorder' | 'instant' } }, DeliveryQuote>(getFunctions(), 'createPublicStoreDeliveryQuote');
    return (await call({ slug, delivery: { selections, destination, deliveryDate, deliverySession, fulfilmentMode } })).data;
  },
  async dispatch(orderId: string): Promise<{ status: string; orderId?: string; difference?: number }> {
    const call = httpsCallable<{ orderId: string }, { status: string; orderId?: string; difference?: number }>(getFunctions(), 'dispatchStoreLalamoveDelivery');
    return (await call({ orderId })).data;
  },
  async cancel(orderId: string): Promise<{ status: string }> {
    const call = httpsCallable<{ orderId: string }, { status: string }>(getFunctions(), 'cancelStoreLalamoveDelivery');
    return (await call({ orderId })).data;
  },
  async refresh(orderId: string): Promise<{ status: string; lifecycleState?: string }> {
    const call = httpsCallable<{ orderId: string }, { status: string; lifecycleState?: string }>(getFunctions(), 'refreshStoreLalamoveDelivery');
    return (await call({ orderId })).data;
  },
  async cityInfo(workspaceId: string): Promise<string[]> {
    const call = httpsCallable<{ workspaceId: string }, Array<{ services?: Array<{ key?: string }> }>>(getFunctions(), 'getStoreLalamoveSandboxCityInfo');
    const cities = (await call({ workspaceId })).data;
    return [...new Set(cities.flatMap(city => (city.services || []).map(service => service.key || '')).filter(Boolean))];
  }
};
