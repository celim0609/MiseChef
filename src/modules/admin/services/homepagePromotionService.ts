import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch
} from 'firebase/firestore';
import { db } from '../../../firebase';
import {
  HOMEPAGE_PROMOTION_COLLECTION,
  mapHomepagePromotion,
  normalizeHomepagePromotionHref,
  type HomepagePromotion
} from '../../public/homepagePromotions';

export interface HomepagePromotionInput {
  eyebrow: string;
  title: string;
  description: string;
  ctaLabel: string;
  href: string;
  imageUrl?: string;
  active: boolean;
}

const requireFirestore = () => {
  if (!db) throw new Error('Homepage promotions are temporarily unavailable.');
  return db;
};

const normalizeInput = (input: HomepagePromotionInput) => {
  const title = input.title.trim();
  const href = normalizeHomepagePromotionHref(input.href);
  if (!title) throw new Error('Enter a promotion title.');
  if (!href) throw new Error('Destination must be a MiseChef path or an HTTPS URL.');

  const imageUrl = input.imageUrl?.trim() || '';
  if (imageUrl && !normalizeHomepagePromotionHref(imageUrl)) {
    throw new Error('Image URL must use HTTPS.');
  }

  return {
    eyebrow: input.eyebrow.trim() || 'MiseChef',
    title,
    description: input.description.trim(),
    ctaLabel: input.ctaLabel.trim() || 'Learn more',
    href,
    ...(imageUrl ? { imageUrl } : {}),
    active: input.active
  };
};

export const homepagePromotionService = {
  async listPromotions(): Promise<HomepagePromotion[]> {
    const firestore = requireFirestore();
    const snapshot = await getDocs(query(collection(firestore, HOMEPAGE_PROMOTION_COLLECTION), orderBy('sortOrder')));
    return snapshot.docs.map(item => mapHomepagePromotion(item.id, item.data()));
  },

  async createPromotion(input: HomepagePromotionInput, userId: string) {
    const firestore = requireFirestore();
    const current = await getDocs(query(collection(firestore, HOMEPAGE_PROMOTION_COLLECTION), orderBy('sortOrder')));
    const reference = doc(collection(firestore, HOMEPAGE_PROMOTION_COLLECTION));
    await setDoc(reference, {
      ...normalizeInput(input),
      sortOrder: current.size,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: userId,
      updatedBy: userId
    });
    return reference.id;
  },

  async updatePromotion(promotion: HomepagePromotion, input: HomepagePromotionInput, userId: string) {
    const firestore = requireFirestore();
    await updateDoc(doc(firestore, HOMEPAGE_PROMOTION_COLLECTION, promotion.id), {
      ...normalizeInput(input),
      updatedAt: serverTimestamp(),
      updatedBy: userId
    });
  },

  async setPromotionActive(promotionId: string, active: boolean, userId: string) {
    const firestore = requireFirestore();
    await updateDoc(doc(firestore, HOMEPAGE_PROMOTION_COLLECTION, promotionId), {
      active,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    });
  },

  async reorderPromotions(promotions: HomepagePromotion[], userId: string) {
    const firestore = requireFirestore();
    const batch = writeBatch(firestore);
    promotions.forEach((promotion, sortOrder) => {
      batch.update(doc(firestore, HOMEPAGE_PROMOTION_COLLECTION, promotion.id), {
        sortOrder,
        updatedAt: serverTimestamp(),
        updatedBy: userId
      });
    });
    await batch.commit();
  }
};
