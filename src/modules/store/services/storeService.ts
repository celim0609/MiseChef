import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  setDoc,
  where
} from 'firebase/firestore';
import { db } from '../../../firebase';
import type { Workspace } from '../../../types';
import {
  createDefaultWorkspaceStore,
  normalizeStoreProduct,
  normalizeWorkspaceStore,
  toStoreSlug,
  validateStoreProduct,
  validateStoreSettings
} from '../storeModel';
import type {
  PublicStoreData,
  StoreProduct,
  StoreProductDraft,
  StoreSettingsDraft,
  WorkspaceStore
} from '../types';

const removeUndefinedFields = <T,>(value: T): T => {
  if (Array.isArray(value)) return value.map(item => removeUndefinedFields(item)) as T;

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, item]) => {
      if (item !== undefined) acc[key] = removeUndefinedFields(item);
      return acc;
    }, {}) as T;
  }

  return value;
};

const createStoreWithSlug = async (
  workspace: Pick<Workspace, 'id' | 'name' | 'country'>,
  createdBy: string,
  slug: string
) => {
  if (!db) throw new Error("We couldn't connect to your Store. Please refresh the page or try again.");

  const storeRef = doc(db, 'stores', workspace.id);
  const slugRef = doc(db, 'storeSlugs', slug);

  return runTransaction(db, async transaction => {
    const [storeSnapshot, slugSnapshot] = await Promise.all([
      transaction.get(storeRef),
      transaction.get(slugRef)
    ]);

    if (storeSnapshot.exists()) {
      return normalizeWorkspaceStore(storeSnapshot.id, storeSnapshot.data() as Record<string, unknown>);
    }

    if (slugSnapshot.exists() && slugSnapshot.data().workspaceId !== workspace.id) {
      throw new Error('STORE_SLUG_TAKEN');
    }

    const store = {
      ...createDefaultWorkspaceStore(workspace, createdBy),
      slug
    };

    transaction.set(storeRef, removeUndefinedFields(store));
    transaction.set(slugRef, {
      slug,
      workspaceId: workspace.id,
      createdAt: store.createdAt
    });
    return store;
  });
};

export const storeService = {
  async ensureWorkspaceStore(
    workspace: Pick<Workspace, 'id' | 'name' | 'country'>,
    createdBy: string
  ): Promise<WorkspaceStore> {
    if (!db) throw new Error("We couldn't connect to your Store. Please refresh the page or try again.");

    const existing = await getDoc(doc(db, 'stores', workspace.id));
    if (existing.exists()) {
      return normalizeWorkspaceStore(existing.id, existing.data() as Record<string, unknown>);
    }

    const baseSlug = toStoreSlug(workspace.name);
    try {
      return await createStoreWithSlug(workspace, createdBy, baseSlug);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'STORE_SLUG_TAKEN') throw error;
      return createStoreWithSlug(
        workspace,
        createdBy,
        `${baseSlug}-${workspace.id.slice(0, 8).toLowerCase()}`
      );
    }
  },

  async updateStore(
    store: WorkspaceStore,
    draft: StoreSettingsDraft
  ): Promise<WorkspaceStore> {
    if (!db) throw new Error("We couldn't connect to your Store. Please refresh the page or try again.");
    const validationError = validateStoreSettings(draft);
    if (validationError) throw new Error(validationError);

    const updatedStore: WorkspaceStore = {
      ...store,
      ...draft,
      name: draft.name.trim(),
      description: draft.description.trim(),
      businessHours: draft.businessHours.trim(),
      updatedAt: new Date().toISOString()
    };

    await setDoc(doc(db, 'stores', store.id), removeUndefinedFields(updatedStore), { merge: true });
    return updatedStore;
  },

  createProductId() {
    if (!db) throw new Error("We couldn't connect to your Store. Please refresh the page or try again.");
    return doc(collection(db, 'storeProducts')).id;
  },

  async listProducts(workspaceId: string): Promise<StoreProduct[]> {
    if (!db || !workspaceId) return [];
    const productsQuery = query(
      collection(db, 'storeProducts'),
      where('workspaceId', '==', workspaceId)
    );
    const snapshot = await getDocs(productsQuery);
    return snapshot.docs
      .map(productDoc => normalizeStoreProduct(productDoc.id, productDoc.data() as Record<string, unknown>))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async createProduct({
    id,
    workspaceId,
    draft,
    createdBy
  }: {
    id: string;
    workspaceId: string;
    draft: StoreProductDraft;
    createdBy: string;
  }): Promise<StoreProduct> {
    if (!db) throw new Error("We couldn't connect to your Store. Please refresh the page or try again.");
    const validationError = validateStoreProduct(draft);
    if (validationError) throw new Error(validationError);

    const now = new Date().toISOString();
    const product: StoreProduct = {
      id,
      storeId: workspaceId,
      workspaceId,
      photoUrl: draft.photoUrl.trim(),
      name: draft.name.trim(),
      description: draft.description.trim(),
      price: draft.price,
      available: draft.available,
      createdBy,
      createdAt: now,
      updatedAt: now
    };

    await setDoc(doc(db, 'storeProducts', id), removeUndefinedFields(product));
    return product;
  },

  async updateProduct(product: StoreProduct, draft: StoreProductDraft): Promise<StoreProduct> {
    if (!db) throw new Error("We couldn't connect to your Store. Please refresh the page or try again.");
    const validationError = validateStoreProduct(draft);
    if (validationError) throw new Error(validationError);

    const updatedProduct: StoreProduct = {
      ...product,
      photoUrl: draft.photoUrl.trim(),
      name: draft.name.trim(),
      description: draft.description.trim(),
      price: draft.price,
      available: draft.available,
      updatedAt: new Date().toISOString()
    };

    await setDoc(doc(db, 'storeProducts', product.id), removeUndefinedFields(updatedProduct), { merge: true });
    return updatedProduct;
  },

  async getPublicStore(slug: string): Promise<PublicStoreData | null> {
    if (!db || !slug.trim()) return null;

    const storeQuery = query(
      collection(db, 'stores'),
      where('slug', '==', toStoreSlug(slug)),
      limit(1)
    );
    const storeSnapshot = await getDocs(storeQuery);
    const storeDocument = storeSnapshot.docs[0];
    if (!storeDocument) return null;

    const store = normalizeWorkspaceStore(
      storeDocument.id,
      storeDocument.data() as Record<string, unknown>
    );
    const productsQuery = query(
      collection(db, 'storeProducts'),
      where('storeId', '==', store.id),
      where('available', '==', true)
    );
    const productSnapshot = await getDocs(productsQuery);
    const products = productSnapshot.docs
      .map(productDoc => normalizeStoreProduct(productDoc.id, productDoc.data() as Record<string, unknown>))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return { store, products };
  }
};
