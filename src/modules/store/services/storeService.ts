import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  setDoc,
  where
} from 'firebase/firestore';
import { auth, db } from '../../../firebase';
import type { Workspace } from '../../../types';
import {
  createDefaultWorkspaceStore,
  normalizeStoreOptionGroup,
  normalizeStoreProduct,
  normalizeWorkspaceStore,
  toStoreSlug,
  validateStoreOptionGroup,
  validateStoreProduct,
  validateStoreSettings
} from '../storeModel';
import type {
  PublicStoreData,
  StoreOptionGroup,
  StoreOptionGroupDraft,
  StoreProduct,
  StoreProductDraft,
  StoreSettingsDraft,
  WorkspaceStore
} from '../types';
import {
  getStoreAuthorizationIssue,
  StoreAuthorizationError
} from '../storeAuthorization';
import {
  buildUpdatedStoreProduct,
  filterPublicAvailableProducts
} from '../storeProductVisibility';

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
  async assertCanManageProducts({
    workspace,
    userId,
    product
  }: {
    workspace: Pick<Workspace, 'id' | 'ownerId' | 'subscriptionStatus'>;
    userId: string;
    product?: Pick<StoreProduct, 'storeId' | 'workspaceId'> | null;
  }): Promise<void> {
    if (!db) throw new Error("We couldn't connect to your Store. Please refresh the page or try again.");

    const [membershipSnapshot, storeSnapshot] = await Promise.all([
      getDoc(doc(db, 'workspaceMembers', `${workspace.id}_${userId}`)),
      getDoc(doc(db, 'stores', workspace.id))
    ]);
    const membership = membershipSnapshot.exists()
      ? membershipSnapshot.data() as { role?: Workspace['members'][number]['role']; status?: string }
      : null;
    const store = storeSnapshot.exists()
      ? normalizeWorkspaceStore(storeSnapshot.id, storeSnapshot.data() as Record<string, unknown>)
      : null;
    const issue = getStoreAuthorizationIssue({
      authenticatedUid: auth?.currentUser?.uid || '',
      requestedUserId: userId,
      workspaceId: workspace.id,
      workspaceOwnerId: workspace.ownerId,
      membership,
      store: store ? { id: store.id, workspaceId: store.workspaceId } : null,
      product,
      subscriptionStatus: workspace.subscriptionStatus
    });
    if (issue) throw new StoreAuthorizationError(issue);
  },

  async getWorkspaceStore(workspaceId: string): Promise<WorkspaceStore | null> {
    if (!db || !workspaceId) return null;
    const snapshot = await getDoc(doc(db, 'stores', workspaceId));
    return snapshot.exists()
      ? normalizeWorkspaceStore(snapshot.id, snapshot.data() as Record<string, unknown>)
      : null;
  },

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
    const validationError = validateStoreSettings(draft, store.country);
    if (validationError) throw new Error(validationError);

    const updatedStore: WorkspaceStore = {
      ...store,
      ...draft,
      name: draft.name.trim(),
      description: draft.description.trim(),
      contactInformation: draft.contactInformation.trim(),
      // Keep the legacy field mirrored while older deployed clients still read it.
      businessWhatsApp: draft.storeContact.whatsapp.trim(),
      storeContact: {
        phone: draft.storeContact.phone.trim(),
        email: draft.storeContact.email.trim(),
        whatsapp: draft.storeContact.whatsapp.trim(),
        facebook: draft.storeContact.facebook.trim(),
        instagram: draft.storeContact.instagram.trim(),
        tiktok: draft.storeContact.tiktok.trim(),
        website: draft.storeContact.website.trim()
      },
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
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
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
      selectionType: draft.selectionType,
      required: draft.required,
      minimumSelections: draft.minimumSelections,
      maximumSelections: draft.maximumSelections,
      sortOrder: draft.sortOrder,
      available: draft.available,
      options: draft.options.map((option, index) => ({
        id: option.id || this.createOptionId(),
        name: option.name.trim(),
        priceAdjustment: option.priceAdjustment,
        available: option.available,
        sortOrder: index
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
      selectionType: draft.selectionType,
      required: draft.required,
      minimumSelections: draft.minimumSelections,
      maximumSelections: draft.maximumSelections,
      sortOrder: draft.sortOrder,
      available: draft.available,
      options: draft.options.map((option, index) => ({
        id: option.id || this.createOptionId(),
        name: option.name.trim(),
        priceAdjustment: option.priceAdjustment,
        available: option.available,
        sortOrder: index
      })),
      updatedAt: new Date().toISOString()
    };
    await setDoc(doc(db, 'storeOptionGroups', group.id), removeUndefinedFields(updatedGroup), { merge: true });
    return updatedGroup;
  },

  async deleteOptionGroup(groupId: string): Promise<void> {
    if (!db) throw new Error("We couldn't connect to your Store. Please refresh the page or try again.");
    await deleteDoc(doc(db, 'storeOptionGroups', groupId));
  },

  async listAdminProducts(workspaceId: string): Promise<StoreProduct[]> {
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

    const updatedProduct = buildUpdatedStoreProduct(product, draft, new Date().toISOString());

    await setDoc(doc(db, 'storeProducts', product.id), removeUndefinedFields(updatedProduct), { merge: true });
    return updatedProduct;
  },

  async deleteProduct(productId: string): Promise<void> {
    if (!db) throw new Error("We couldn't connect to your Store. Please refresh the page or try again.");
    await deleteDoc(doc(db, 'storeProducts', productId));
  },

  async getPublicStore(slug: string): Promise<PublicStoreData | null> {
    if (import.meta.env.DEV && import.meta.env.VITE_STORE_QA_FIXTURE === 'true') {
      const { createPublicStoreQaFixture } = await import('../testing/publicStoreQaFixture');
      return createPublicStoreQaFixture(slug);
    }
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
    const products = filterPublicAvailableProducts(productSnapshot.docs
      .map(productDoc => normalizeStoreProduct(productDoc.id, productDoc.data() as Record<string, unknown>))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), store.id);
    const referencedGroupIds = new Set(products.flatMap(product => product.optionGroupIds));
    const optionGroups = optionGroupSnapshot.docs
      .map(groupDoc => normalizeStoreOptionGroup(groupDoc.id, groupDoc.data() as Record<string, unknown>))
      .filter(group => referencedGroupIds.has(group.id))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

    return { store, products, optionGroups };
  }
};
