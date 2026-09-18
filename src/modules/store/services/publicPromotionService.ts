import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase';
export type PublicPromotion = { id?: string; productId: string; name: string; type: 'percentage' | 'fixed_amount' | 'buy_x_get_y'; savings: number; terms: Record<string, number>; originalPrice: number; estimatedPrice: number | null };
export const publicPromotionService = { async list(slug: string) { if (!functions) return []; return (await httpsCallable<{ slug: string }, { promotions: PublicPromotion[] }>(functions, 'getPublicStorePromotions')({ slug })).data.promotions; } };
