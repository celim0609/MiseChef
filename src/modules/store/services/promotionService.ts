import { collection, doc, getDocs, query, setDoc, where, Timestamp } from 'firebase/firestore';
import { db } from '../../../firebase';
import type { StorePromotion } from '../types';
import type { StorePromotionDraft } from '../promotionModel';

const asDate = (value: unknown) => value && typeof value === 'object' && 'toDate' in value ? (value as { toDate: () => Date }).toDate() : new Date(value as string);
const normalize = (id: string, value: Record<string, unknown>): StorePromotion => ({ ...value, id, startsAt: asDate(value.startsAt), endsAt: value.endsAt ? asDate(value.endsAt) : null } as StorePromotion);
export const promotionService = {
  async list(workspaceId: string) { if (!db) return []; const snapshots = await getDocs(query(collection(db, 'storePromotions'), where('workspaceId', '==', workspaceId))); return snapshots.docs.map(item => normalize(item.id, item.data())).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))); },
  id() { if (!db) throw new Error('Store unavailable.'); return doc(collection(db, 'storePromotions')).id; },
  async save(id: string, workspaceId: string, userId: string, draft: StorePromotionDraft, existing?: StorePromotion) {
    if (!db) throw new Error('Store unavailable.'); const now = Timestamp.now();
    const data = { id, storeId: workspaceId, workspaceId, name: draft.name.trim(), active: draft.active, type: draft.type, eligibleProductIds: [...new Set(draft.eligibleProductIds)], minimumQuantity: draft.minimumQuantity, minimumOrderAmount: draft.minimumOrderAmount, startsAt: Timestamp.fromDate(draft.startsAt), endsAt: draft.endsAt ? Timestamp.fromDate(draft.endsAt) : null, priority: draft.priority, createdBy: existing?.createdBy || userId, createdAt: existing?.createdAt || now, updatedAt: now,
      ...(draft.type === 'percentage' ? { percentageOff: draft.percentageOff } : {}), ...(draft.type === 'fixed_amount' ? { fixedAmountOff: draft.fixedAmountOff } : {}), ...(draft.type === 'buy_x_get_y' ? { buyQuantity: draft.buyQuantity, getQuantity: draft.getQuantity } : {}) };
    await setDoc(doc(db, 'storePromotions', id), data); return normalize(id, data);
  }
};
