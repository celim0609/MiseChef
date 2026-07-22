import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { deleteObject, getDownloadURL, ref, uploadBytes, type StorageReference } from 'firebase/storage';
import { db, functions, storage } from '../../../firebase';
import type { ApprovedProduct, ApprovedProductSummary } from '../../../types';
import { APPROVED_MERCHANT_HOSTNAME, normalizeApprovedAffiliateUrl } from './approvedProductValidation';

export { APPROVED_MERCHANT_HOSTNAME, normalizeApprovedAffiliateUrl } from './approvedProductValidation';
const PRODUCT_IMAGE_SIDE = 400;
const PRODUCT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

const loadImage = (file: File) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  const objectUrl = URL.createObjectURL(file);
  image.onload = () => {
    URL.revokeObjectURL(objectUrl);
    resolve(image);
  };
  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    reject(new Error('The product image could not be read.'));
  };
  image.src = objectUrl;
});

export const optimizeApprovedProductImage = async (file: File) => {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Product image must be a JPG, PNG, or WEBP file.');
  }
  if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
    throw new Error('Product image must be smaller than 10 MB.');
  }

  const image = await loadImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = PRODUCT_IMAGE_SIDE;
  canvas.height = PRODUCT_IMAGE_SIDE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Product image optimization is unavailable.');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, PRODUCT_IMAGE_SIDE, PRODUCT_IMAGE_SIDE);
  const scale = Math.min(PRODUCT_IMAGE_SIDE / image.naturalWidth, PRODUCT_IMAGE_SIDE / image.naturalHeight);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  context.drawImage(image, Math.round((PRODUCT_IMAGE_SIDE - width) / 2), Math.round((PRODUCT_IMAGE_SIDE - height) / 2), width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Product image optimization failed.')), 'image/jpeg', 0.82);
  });
};

const requireFirebase = () => {
  if (!db || !storage) throw new Error('Approved products are temporarily unavailable.');
  return { firestore: db, firebaseStorage: storage };
};

const uploadProductImage = async (productId: string, file: File) => {
  const { firebaseStorage } = requireFirebase();
  const image = await optimizeApprovedProductImage(file);
  const imageReference = ref(firebaseStorage, `approved-products/${productId}/image-${Date.now()}-${crypto.randomUUID()}.jpg`);
  await uploadBytes(imageReference, image, {
    contentType: 'image/jpeg',
    cacheControl: 'public,max-age=31536000'
  });
  return { imageUrl: await getDownloadURL(imageReference), imageReference };
};

const mapApprovedProduct = (id: string, value: Record<string, unknown>): ApprovedProduct => ({
  id,
  name: String(value.name || ''),
  imageUrl: typeof value.imageUrl === 'string' && value.imageUrl ? value.imageUrl : undefined,
  affiliateUrl: String(value.affiliateUrl || ''),
  merchantHostname: APPROVED_MERCHANT_HOSTNAME,
  active: value.active === true,
  createdAt: value.createdAt,
  updatedAt: value.updatedAt,
  createdBy: String(value.createdBy || ''),
  updatedBy: String(value.updatedBy || '')
});

export const approvedProductService = {
  async listAdminProducts(): Promise<ApprovedProduct[]> {
    if (!db) return [];
    const snapshot = await getDocs(query(collection(db, 'approvedProducts'), orderBy('name')));
    return snapshot.docs.map(product => mapApprovedProduct(product.id, product.data()));
  },

  async listChefProducts(): Promise<ApprovedProductSummary[]> {
    if (!functions) return [];
    const listProducts = httpsCallable<Record<string, never>, { products: ApprovedProductSummary[] }>(functions, 'listApprovedProducts');
    const result = await listProducts({});
    return Array.isArray(result.data.products) ? result.data.products : [];
  },

  async createProduct({
    name,
    affiliateUrl,
    active,
    imageFile,
    userId
  }: {
    name: string;
    affiliateUrl: string;
    active: boolean;
    imageFile?: File;
    userId: string;
  }) {
    const { firestore } = requireFirebase();
    const normalizedName = name.trim();
    const normalizedUrl = normalizeApprovedAffiliateUrl(affiliateUrl);
    if (!normalizedName) throw new Error('Enter a product name.');
    if (!normalizedUrl) throw new Error(`Affiliate URL must use https://${APPROVED_MERCHANT_HOSTNAME}.`);

    const productReference = doc(collection(firestore, 'approvedProducts'));
    let uploadedImageReference: StorageReference | undefined;
    try {
      const uploadedImage = imageFile ? await uploadProductImage(productReference.id, imageFile) : undefined;
      uploadedImageReference = uploadedImage?.imageReference;
      await setDoc(productReference, {
        name: normalizedName,
        ...(uploadedImage?.imageUrl ? { imageUrl: uploadedImage.imageUrl } : {}),
        affiliateUrl: normalizedUrl,
        merchantHostname: APPROVED_MERCHANT_HOSTNAME,
        active,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: userId,
        updatedBy: userId
      });
    } catch (error) {
      if (uploadedImageReference) await deleteObject(uploadedImageReference).catch(() => undefined);
      throw error;
    }
    return productReference.id;
  },

  async updateProduct({
    product,
    name,
    affiliateUrl,
    active,
    imageFile,
    userId
  }: {
    product: ApprovedProduct;
    name: string;
    affiliateUrl: string;
    active: boolean;
    imageFile?: File;
    userId: string;
  }) {
    const { firestore } = requireFirebase();
    const normalizedName = name.trim();
    const normalizedUrl = normalizeApprovedAffiliateUrl(affiliateUrl);
    if (!normalizedName) throw new Error('Enter a product name.');
    if (!normalizedUrl) throw new Error(`Affiliate URL must use https://${APPROVED_MERCHANT_HOSTNAME}.`);

    const uploadedImage = imageFile ? await uploadProductImage(product.id, imageFile) : undefined;
    try {
      await updateDoc(doc(firestore, 'approvedProducts', product.id), {
        name: normalizedName,
        ...(uploadedImage?.imageUrl ? { imageUrl: uploadedImage.imageUrl } : {}),
        affiliateUrl: normalizedUrl,
        merchantHostname: APPROVED_MERCHANT_HOSTNAME,
        active,
        updatedAt: serverTimestamp(),
        updatedBy: userId
      });
    } catch (error) {
      if (uploadedImage?.imageReference) await deleteObject(uploadedImage.imageReference).catch(() => undefined);
      throw error;
    }
    if (uploadedImage?.imageUrl && product.imageUrl && product.imageUrl !== uploadedImage.imageUrl) {
      await deleteObject(ref(storage!, product.imageUrl)).catch(() => undefined);
    }
  },

  async setProductActive(productId: string, active: boolean, userId: string) {
    if (!db) throw new Error('Approved products are temporarily unavailable.');
    await updateDoc(doc(db, 'approvedProducts', productId), {
      active,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    });
  }
};
