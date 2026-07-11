import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '../../../firebase';
import type { Supplier, SupplierDraft, SupplierFilters, SupplierQuotation, SupplierQuotationInput, SupplierQuotationSummary } from '../types';

const quotations: SupplierQuotation[] = [];

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

const normalizeIngredientKey = (quotation: Pick<SupplierQuotation, 'ingredientId' | 'ingredientName'>) => {
  if (quotation.ingredientId?.trim()) return quotation.ingredientId.trim();
  return quotation.ingredientName.trim().toLowerCase();
};

const sortByNewestQuotation = (a: SupplierQuotation, b: SupplierQuotation) => {
  const aDate = a.effectiveDate || a.createdAt;
  const bDate = b.effectiveDate || b.createdAt;
  const byEffectiveDate = bDate.localeCompare(aDate);
  if (byEffectiveDate !== 0) return byEffectiveDate;
  return b.createdAt.localeCompare(a.createdAt);
};

const normalizeSupplier = (supplier: Partial<Supplier> & { id: string }): Supplier => ({
  id: supplier.id,
  companyName: supplier.companyName || '',
  contactPerson: supplier.contactPerson || '',
  email: supplier.email || '',
  phone: supplier.phone || '',
  address: supplier.address || '',
  currency: supplier.currency || 'SGD',
  paymentTerms: supplier.paymentTerms || '',
  deliveryDays: typeof supplier.deliveryDays === 'number' ? supplier.deliveryDays : null,
  gstRegistered: Boolean(supplier.gstRegistered),
  notes: supplier.notes || '',
  status: supplier.status === 'Archived' ? 'Archived' : 'Active',
  totalQuotations: Number(supplier.totalQuotations || 0),
  createdAt: supplier.createdAt || new Date().toISOString(),
  updatedAt: supplier.updatedAt || supplier.createdAt || new Date().toISOString(),
  archivedAt: supplier.archivedAt || null,
  createdBy: supplier.createdBy || '',
  workspaceId: supplier.workspaceId || supplier.createdBy || ''
});

const matchesSupplierSearch = (supplier: Supplier, searchTerm: string) => {
  const queryText = searchTerm.trim().toLowerCase();
  if (!queryText) return true;

  return [supplier.companyName, supplier.contactPerson, supplier.email]
    .some(value => value.toLowerCase().includes(queryText));
};

const matchesSupplierStatus = (supplier: Supplier, status: SupplierFilters['status']) => (
  status === 'All' || supplier.status === status
);

export const supplierService = {
  async listSuppliers(workspaceId?: string, filters: SupplierFilters = { searchTerm: '', status: 'Active' }): Promise<Supplier[]> {
    if (!db || !workspaceId) return [];

    const suppliersQuery = query(collection(db, 'suppliers'), where('workspaceId', '==', workspaceId));
    const snapshot = await getDocs(suppliersQuery);

    return snapshot.docs
      .map(supplierDoc => normalizeSupplier({ id: supplierDoc.id, ...supplierDoc.data() }))
      .filter(supplier => matchesSupplierStatus(supplier, filters.status))
      .filter(supplier => matchesSupplierSearch(supplier, filters.searchTerm))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async createSupplier(draft: SupplierDraft, userId: string, workspaceId = userId): Promise<Supplier> {
    if (!db) throw new Error("We couldn't connect to your workspace. Please refresh the page or try again.");

    const now = new Date().toISOString();
    const supplierRef = doc(collection(db, 'suppliers'));
    const supplier: Supplier = normalizeSupplier({
      ...draft,
      id: supplierRef.id,
      status: 'Active',
      totalQuotations: 0,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      createdBy: userId,
      workspaceId
    });

    await setDoc(supplierRef, removeUndefinedFields(supplier));
    return supplier;
  },

  async updateSupplier(supplierId: string, draft: SupplierDraft, userId: string, workspaceId = userId): Promise<Supplier> {
    if (!db) throw new Error("We couldn't connect to your workspace. Please refresh the page or try again.");

    const now = new Date().toISOString();
    const supplierRef = doc(db, 'suppliers', supplierId);
    const supplierUpdate = removeUndefinedFields({
      ...draft,
      id: supplierId,
      updatedAt: now,
      createdBy: userId,
      workspaceId
    });

    await setDoc(supplierRef, supplierUpdate, { merge: true });
    return normalizeSupplier({ ...supplierUpdate, id: supplierId } as Supplier);
  },

  async archiveSupplier(supplier: Supplier, userId: string, workspaceId = userId): Promise<Supplier> {
    if (!db) throw new Error("We couldn't connect to your workspace. Please refresh the page or try again.");

    const now = new Date().toISOString();
    const archivedSupplier: Supplier = {
      ...supplier,
      status: 'Archived',
      archivedAt: now,
      updatedAt: now,
      createdBy: supplier.createdBy || userId,
      workspaceId: supplier.workspaceId || workspaceId
    };

    await setDoc(doc(db, 'suppliers', supplier.id), removeUndefinedFields(archivedSupplier), { merge: true });
    return archivedSupplier;
  },

  async listQuotations(): Promise<SupplierQuotation[]> {
    return supplierService.resolveActiveQuotations(quotations);
  },

  resolveActiveQuotations(sourceQuotations: SupplierQuotation[]): SupplierQuotation[] {
    const newestByIngredient = new Map<string, string>();

    [...sourceQuotations]
      .sort(sortByNewestQuotation)
      .forEach(quotation => {
        const key = normalizeIngredientKey(quotation);
        if (!newestByIngredient.has(key)) {
          newestByIngredient.set(key, quotation.id);
        }
      });

    return sourceQuotations
      .map(quotation => ({
        ...quotation,
        isActive: newestByIngredient.get(normalizeIngredientKey(quotation)) === quotation.id
      }))
      .sort(sortByNewestQuotation);
  },

  async createQuotation(draft: SupplierQuotationInput): Promise<SupplierQuotation> {
    const now = new Date().toISOString();
    const quotation: SupplierQuotation = {
      ...draft,
      id: `quotation_${Date.now()}`,
      supplierName: 'Unknown Supplier',
      isActive: false,
      createdAt: now,
      updatedAt: now
    };
    quotations.push(quotation);
    const resolved = supplierService.resolveActiveQuotations(quotations);
    quotations.splice(0, quotations.length, ...resolved);
    return quotations.find(item => item.id === quotation.id) || quotation;
  },

  async getSummary(workspaceId?: string): Promise<SupplierQuotationSummary> {
    const [activeSuppliers, archivedSuppliers] = await Promise.all([
      supplierService.listSuppliers(workspaceId, { searchTerm: '', status: 'Active' }),
      supplierService.listSuppliers(workspaceId, { searchTerm: '', status: 'Archived' })
    ]);
    const resolvedQuotations = supplierService.resolveActiveQuotations(quotations);
    const latestQuotationDate = resolvedQuotations[0]?.effectiveDate || resolvedQuotations[0]?.createdAt || null;

    return {
      totalSuppliers: activeSuppliers.length + archivedSuppliers.length,
      activeSuppliers: activeSuppliers.length,
      archivedSuppliers: archivedSuppliers.length,
      totalQuotations: activeSuppliers.reduce((sum, supplier) => sum + supplier.totalQuotations, 0),
      activeQuotations: resolvedQuotations.filter(quotation => quotation.isActive).length,
      latestQuotationDate
    };
  }
};
