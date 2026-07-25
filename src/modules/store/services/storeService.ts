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
  buildStoreOrderItems,
  normalizeStoreOptionGroup,
  normalizeStoreProduct,
  normalizeWorkspaceStore,
  toStoreSlug,
  validateStoreOptionGroup,
  validateStoreOrder,
  validateStoreProduct,
  validateStoreSettings
} from '../storeModel';
import type {
  PublicStoreData,
  StoreOptionGroup,
  StoreOptionGroupDraft,
  StoreOrder,
  StoreOrderDraft,
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
      contactInformation: draft.contactInformation.trim(),
      businessHours: draft.businessHours.trim(),
      pickupSessions: [...new Set(draft.pickupSessions.map(session => session.trim()).filter(Boolean))],
      pickupLocations: draft.pickupLocations.map(location => ({
        id: location.id,
        name: location.name.trim(),
        address: location.address.trim(),
        notes: location.notes.trim()
      })),
      orderDays: [...draft.orderDays],
      earliestPickupDays: draft.earliestPickupDays,
      maximumAdvanceDays: draft.maximumAdvanceDays,
      unavailableDates: [...new Set(draft.unavailableDates)].sort(),
      pickupEnabled: draft.pickupLocations.length > 0
        && draft.pickupSessions.some(session => Boolean(session.trim())),
      updatedAt: new Date().toISOString()
    };

    await setDoc(doc(db, 'stores', store.id), removeUndefinedFields(updatedStore), { merge: true });
    return updatedStore;
  },

  createProductId() {
    if (!db) throw new Error("We couldn't connect to your Store. Please refresh the page or try again.");
    return doc(collection(db, 'storeProducts')).id;
  },

  createOptionGroupId() {
    if (!db) throw new Error("We couldn't connect to your Store. Please refresh the page or try again.");
    return doc(collection(db, 'storeOptionGroups')).id;
  },

  createOptionId() {
    if (!db) throw new Error("We couldn't connect to your Store. Please refresh the page or try again.");
    return doc(collection(db, 'storeOptionIds')).id;
  },

  createPickupLocationId() {
    if (!db) throw new Error("We couldn't connect to your Store. Please refresh the page or try again.");
    return doc(collection(db, 'storePickupLocationIds')).id;
  },

  async listOptionGroups(workspaceId: string): Promise<StoreOptionGroup[]> {
    if (!db || !workspaceId) return [];
    const groupsQuery = query(
      collection(db, 'storeOptionGroups'),
      where('workspaceId', '==', workspaceId)
    );
    const snapshot = await getDocs(groupsQuery);
    return snapshot.docs
      .map(groupDoc => normalizeStoreOptionGroup(groupDoc.id, groupDoc.data() as Record<string, unknown>))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async createOptionGroup({
    id,
    workspaceId,
    draft,
    createdBy
  }: {
    id: string;
    workspaceId: string;
    draft: StoreOptionGroupDraft;
    createdBy: string;
  }): Promise<StoreOptionGroup> {
    if (!db) throw new Error("We couldn't connect to your Store. Please refresh the page or try again.");
    const validationError = validateStoreOptionGroup(draft);
    if (validationError) throw new Error(validationError);

    const now = new Date().toISOString();
    const group: StoreOptionGroup = {
      id,
      storeId: workspaceId,
      workspaceId,
      name: draft.name.trim(),
      options: draft.options.map(option => ({
        id: option.id || this.createOptionId(),
        name: option.name.trim(),
        priceAdjustment: option.priceAdjustment
      })),
      createdBy,
      createdAt: now,
      updatedAt: now
    };
    await setDoc(doc(db, 'storeOptionGroups', id), removeUndefinedFields(group));
    return group;
  },

  async updateOptionGroup(
    group: StoreOptionGroup,
    draft: StoreOptionGroupDraft
  ): Promise<StoreOptionGroup> {
    if (!db) throw new Error("We couldn't connect to your Store. Please refresh the page or try again.");
    const validationError = validateStoreOptionGroup(draft);
    if (validationError) throw new Error(validationError);

    const updatedGroup: StoreOptionGroup = {
      ...group,
      name: draft.name.trim(),
      options: draft.options.map(option => ({
        id: option.id || this.createOptionId(),
        name: option.name.trim(),
        priceAdjustment: option.priceAdjustment
      })),
      updatedAt: new Date().toISOString()
    };
    await setDoc(doc(db, 'storeOptionGroups', group.id), removeUndefinedFields(updatedGroup), { merge: true });
    return updatedGroup;
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
      optionGroupIds: [...draft.optionGroupIds],
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
      optionGroupIds: [...draft.optionGroupIds],
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
    const optionGroupsQuery = query(
      collection(db, 'storeOptionGroups'),
      where('storeId', '==', store.id)
    );
    const [productSnapshot, optionGroupSnapshot] = await Promise.all([
      getDocs(productsQuery),
      getDocs(optionGroupsQuery)
    ]);
    const products = productSnapshot.docs
      .map(productDoc => normalizeStoreProduct(productDoc.id, productDoc.data() as Record<string, unknown>))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const referencedGroupIds = new Set(products.flatMap(product => product.optionGroupIds));
    const optionGroups = optionGroupSnapshot.docs
      .map(groupDoc => normalizeStoreOptionGroup(groupDoc.id, groupDoc.data() as Record<string, unknown>))
      .filter(group => referencedGroupIds.has(group.id))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { store, products, optionGroups };
  },

  async placeOrder(slug: string, draft: StoreOrderDraft): Promise<StoreOrder> {
    if (!db) throw new Error("We couldn't connect to this Store. Please refresh the page or try again.");
    const currentData = await this.getPublicStore(slug);
    if (!currentData) throw new Error('This Store is no longer available.');

    const validationError = validateStoreOrder(draft, currentData.store);
    if (validationError) throw new Error(validationError);

    const items = buildStoreOrderItems(draft.selections, currentData.products, currentData.optionGroups);
    const pickupLocation = currentData.store.pickupLocations.find(location => location.id === draft.pickupLocationId);
    if (!pickupLocation) throw new Error('Choose a valid pickup location.');
    const orderRef = doc(collection(db, 'storeOrders'));
    const order: StoreOrder = {
      id: orderRef.id,
      storeId: currentData.store.id,
      workspaceId: currentData.store.workspaceId,
      storeName: currentData.store.name,
      currency: currentData.store.currency,
      customerName: draft.customerName.trim(),
      phone: draft.phone.trim(),
      pickupDate: draft.pickupDate,
      pickupSession: draft.pickupSession,
      pickupLocationId: pickupLocation.id,
      pickupLocationName: pickupLocation.name,
      pickupLocationAddress: pickupLocation.address,
      pickupLocationNotes: pickupLocation.notes,
      notes: draft.notes.trim(),
      items,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      total: Math.round(items.reduce((sum, item) => sum + item.lineTotal, 0) * 100) / 100,
      status: 'Placed',
      createdAt: new Date().toISOString()
    };
    await setDoc(orderRef, removeUndefinedFields(order));
    return order;
  }
};
