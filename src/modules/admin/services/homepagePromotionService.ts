import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes, type StorageReference } from 'firebase/storage';
import { db, storage } from '../../../firebase';
import {
  HOMEPAGE_PROMOTION_COLLECTION,
  mapHomepagePromotion,
  normalizeHomepagePromotionHref,
  type HomepagePromotion,
  type HomepagePromotionLinkType,
  type HomepagePromotionSocialPlatform
} from '../../public/homepagePromotions';
import { validateHomepagePromotionImageFile } from './homepagePromotionImage';

const PROMOTION_IMAGE_MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const PROMOTION_IMAGE_MAX_WIDTH = 1600;
const PROMOTION_IMAGE_MAX_HEIGHT = 900;

export interface HomepagePromotionInput {
  eyebrow: string;
  title: string;
  description: string;
  ctaLabel: string;
  href: string;
  linkType: HomepagePromotionLinkType;
  socialPlatform?: HomepagePromotionSocialPlatform;
  imageUrl?: string;
  imageFile?: File;
  removeImage?: boolean;
  active: boolean;
}

const requireFirestore = () => {
  if (!db) throw new Error('Homepage promotions are temporarily unavailable.');
  return db;
};

const requireStorage = () => {
  if (!storage) throw new Error('Homepage promotion image uploads are temporarily unavailable.');
  return storage;
};

export { validateHomepagePromotionImageFile } from './homepagePromotionImage';

const loadImage = (file: File) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  const objectUrl = URL.createObjectURL(file);
  image.onload = () => {
    URL.revokeObjectURL(objectUrl);
    resolve(image);
  };
  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    reject(new Error('The promotion image could not be read.'));
  };
  image.src = objectUrl;
});

export const optimizeHomepagePromotionImage = async (file: File) => {
  validateHomepagePromotionImageFile(file);
  const image = await loadImage(file);
  const scale = Math.min(1, PROMOTION_IMAGE_MAX_WIDTH / image.naturalWidth, PROMOTION_IMAGE_MAX_HEIGHT / image.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Promotion image optimization is unavailable.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(value => value ? resolve(value) : reject(new Error('Promotion image optimization failed.')), 'image/jpeg', 0.82);
  });
  if (blob.size > PROMOTION_IMAGE_MAX_OUTPUT_BYTES) throw new Error('The optimized promotion image is still too large. Choose a smaller image.');
  return blob;
};

const uploadPromotionImage = async (promotionId: string, file: File) => {
  const firebaseStorage = requireStorage();
  const image = await optimizeHomepagePromotionImage(file);
  const imagePath = `homepage-promotions/${promotionId}/image-${Date.now()}-${crypto.randomUUID()}.jpg`;
  const imageReference = ref(firebaseStorage, imagePath);
  await uploadBytes(imageReference, image, {
    contentType: 'image/jpeg',
    cacheControl: 'public,max-age=31536000'
  });
  return { imageUrl: await getDownloadURL(imageReference), imagePath, imageReference };
};

const normalizeInput = (input: HomepagePromotionInput) => {
  const title = input.title.trim();
  const href = normalizeHomepagePromotionHref(input.href, input.linkType);
  if (!title) throw new Error('Enter a promotion title.');
  if (!href) throw new Error(input.linkType === 'internal'
    ? 'MiseChef Page destinations must begin with /.'
    : 'External and social destinations must use a valid HTTPS URL.');

  const imageUrl = input.imageUrl?.trim() || '';
  if (imageUrl && !normalizeHomepagePromotionHref(imageUrl, 'external')) {
    throw new Error('Image URL must use HTTPS.');
  }

  return {
    eyebrow: input.eyebrow.trim() || 'MiseChef',
    title,
    description: input.description.trim(),
    ctaLabel: input.ctaLabel.trim() || 'Learn more',
    href,
    linkType: input.linkType,
    ...(input.linkType === 'social' ? { socialPlatform: input.socialPlatform || 'other' } : {}),
    ...(imageUrl && !input.removeImage ? { imageUrl } : {}),
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
    let uploadedImageReference: StorageReference | undefined;
    try {
      const uploadedImage = input.imageFile ? await uploadPromotionImage(reference.id, input.imageFile) : undefined;
      uploadedImageReference = uploadedImage?.imageReference;
      await setDoc(reference, {
        ...normalizeInput(input),
        ...(uploadedImage ? { imageUrl: uploadedImage.imageUrl, imagePath: uploadedImage.imagePath } : {}),
        sortOrder: current.size,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: userId,
        updatedBy: userId
      });
    } catch (error) {
      if (uploadedImageReference) await deleteObject(uploadedImageReference).catch(() => undefined);
      throw error;
    }
    return reference.id;
  },

  async updatePromotion(promotion: HomepagePromotion, input: HomepagePromotionInput, userId: string) {
    const firestore = requireFirestore();
    const uploadedImage = input.imageFile ? await uploadPromotionImage(promotion.id, input.imageFile) : undefined;
    const replacesStoredImage = Boolean(promotion.imagePath) && (
      Boolean(uploadedImage)
      || input.removeImage === true
      || (input.imageUrl?.trim() || '') !== (promotion.imageUrl || '')
    );
    try {
      await updateDoc(doc(firestore, HOMEPAGE_PROMOTION_COLLECTION, promotion.id), {
        ...normalizeInput(input),
        ...(uploadedImage
          ? { imageUrl: uploadedImage.imageUrl, imagePath: uploadedImage.imagePath }
          : input.removeImage || !input.imageUrl?.trim()
            ? { imageUrl: deleteField(), imagePath: deleteField() }
            : replacesStoredImage
              ? { imagePath: deleteField() }
              : {}),
        updatedAt: serverTimestamp(),
        updatedBy: userId
      });
    } catch (error) {
      if (uploadedImage) await deleteObject(uploadedImage.imageReference).catch(() => undefined);
      throw error;
    }
    if (replacesStoredImage && promotion.imagePath) {
      await deleteObject(ref(requireStorage(), promotion.imagePath)).catch(() => undefined);
    }
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
  },

  async deletePromotion(promotion: HomepagePromotion) {
    const firestore = requireFirestore();
    await deleteDoc(doc(firestore, HOMEPAGE_PROMOTION_COLLECTION, promotion.id));
    if (promotion.imagePath && storage) {
      await deleteObject(ref(storage, promotion.imagePath)).catch(() => undefined);
    }
  }
};
