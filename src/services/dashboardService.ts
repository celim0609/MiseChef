import { collection, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import type { Recipe } from '../types';
import { businessService } from '../modules/business/services';
import type { BusinessSale } from '../modules/business/types';
import { ingredientService, invoiceService } from '../modules/costing/services';
import type { CostingIngredient, CostingInvoice, PendingRecipeCostRecalculation } from '../modules/costing/types';
import { supplierService } from '../modules/suppliers/services';
import type { Supplier, SupplierQuotation } from '../modules/suppliers/types';
import { isPermissionError } from '../utils/customerErrorMessages';

export type DashboardSourceStatus = 'ready' | 'permission-denied' | 'error';

export interface DashboardSource<T> {
  status: DashboardSourceStatus;
  data: T;
  error?: unknown;
}

export interface DashboardAiUsage {
  todayRequests: number;
  monthRequests: number;
  monthFailures: number;
  recordCount: number;
}

export interface OwnerDashboardData {
  invoices: DashboardSource<CostingInvoice[]>;
  ingredients: DashboardSource<CostingIngredient[]>;
  suppliers: DashboardSource<Supplier[]>;
  quotations: DashboardSource<SupplierQuotation[]>;
  sales: DashboardSource<BusinessSale[]>;
  recipes: DashboardSource<Recipe[]>;
  aiUsage: DashboardSource<DashboardAiUsage>;
  recalculations: DashboardSource<PendingRecipeCostRecalculation[]>;
}

const emptyAiUsage: DashboardAiUsage = {
  todayRequests: 0,
  monthRequests: 0,
  monthFailures: 0,
  recordCount: 0
};

const readString = (value: unknown) => typeof value === 'string' ? value : '';
const readNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0;
const readTimestamp = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  return '';
};

const normalizeQuotation = (id: string, data: Record<string, unknown>): SupplierQuotation => ({
  id,
  supplierId: readString(data.supplierId),
  supplierName: readString(data.supplierName),
  ingredientId: readString(data.ingredientId) || undefined,
  ingredientName: readString(data.ingredientName),
  sku: readString(data.sku),
  brand: readString(data.brand),
  packSize: readString(data.packSize),
  unit: readString(data.unit),
  unitPrice: readNumber(data.unitPrice),
  currency: readString(data.currency) || 'SGD',
  gstIncluded: Boolean(data.gstIncluded),
  effectiveDate: readString(data.effectiveDate),
  expiryDate: readString(data.expiryDate) || undefined,
  notes: readString(data.notes),
  isActive: Boolean(data.isActive),
  createdAt: readTimestamp(data.createdAt) || readString(data.createdAt),
  updatedAt: readTimestamp(data.updatedAt) || readString(data.updatedAt),
  createdBy: readString(data.createdBy),
  workspaceId: readString(data.workspaceId)
});

const loadSource = async <T,>(loader: () => Promise<T>, fallback: T): Promise<DashboardSource<T>> => {
  try {
    return { status: 'ready', data: await loader() };
  } catch (error) {
    return {
      status: isPermissionError(error) ? 'permission-denied' : 'error',
      data: fallback,
      error
    };
  }
};

const requireFirestore = () => {
  if (!db) throw new Error("We couldn't connect to your workspace. Please refresh the page or try again.");
  return db;
};

const listWorkspaceQuotations = async (workspaceId: string) => {
  const firestore = requireFirestore();
  const readCollection = async (collectionName: string) => {
    const quotationQuery = query(collection(firestore, collectionName), where('workspaceId', '==', workspaceId));
    const snapshot = await getDocs(quotationQuery);
    return snapshot.docs.map(document => normalizeQuotation(document.id, document.data() as Record<string, unknown>));
  };

  const [supplierQuotations, quotations] = await Promise.all([
    readCollection('supplierQuotations'),
    readCollection('quotations')
  ]);
  return [...supplierQuotations, ...quotations];
};

const listWorkspaceRecipes = async (workspaceId: string) => {
  const firestore = requireFirestore();
  const recipeQuery = query(collection(firestore, 'recipes'), where('workspaceId', '==', workspaceId));
  const snapshot = await getDocs(recipeQuery);
  return snapshot.docs.map(document => ({ id: document.id, ...document.data() } as Recipe));
};

const listPendingRecalculations = async (workspaceId: string) => {
  const firestore = requireFirestore();
  const recalculationQuery = query(collection(firestore, 'recipeCostRecalculations'), where('workspaceId', '==', workspaceId));
  const snapshot = await getDocs(recalculationQuery);
  return snapshot.docs
    .map(document => ({ id: document.id, ...document.data() } as PendingRecipeCostRecalculation))
    .filter(item => item.status === 'Pending');
};

const getWorkspaceAiUsage = async (workspaceId: string): Promise<DashboardAiUsage> => {
  if (!functions) throw new Error('AI usage is temporarily unavailable. Please refresh the page or try again.');
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const getDashboardAiUsage = httpsCallable<{
    workspaceId: string;
    todayStart: string;
    tomorrowStart: string;
    monthStart: string;
    nextMonthStart: string;
  }, DashboardAiUsage>(functions, 'getDashboardAiUsage');
  const response = await getDashboardAiUsage({
    workspaceId,
    todayStart: todayStart.toISOString(),
    tomorrowStart: tomorrowStart.toISOString(),
    monthStart: monthStart.toISOString(),
    nextMonthStart: nextMonthStart.toISOString()
  });
  return response.data;
};

export const dashboardService = {
  async loadOwnerDashboard(userId: string, workspaceId: string): Promise<OwnerDashboardData> {
    const [invoices, ingredients, suppliers, quotations, sales, recipes, aiUsage, recalculations] = await Promise.all([
      loadSource(() => {
        requireFirestore();
        return invoiceService.listInvoices(userId, { includeArchived: false, workspaceId });
      }, [] as CostingInvoice[]),
      loadSource(() => {
        requireFirestore();
        return ingredientService.listIngredients(workspaceId);
      }, [] as CostingIngredient[]),
      loadSource(() => {
        requireFirestore();
        return supplierService.listSuppliers(workspaceId, { searchTerm: '', status: 'Active' });
      }, [] as Supplier[]),
      loadSource(() => listWorkspaceQuotations(workspaceId), [] as SupplierQuotation[]),
      loadSource(() => {
        requireFirestore();
        return businessService.listSales(workspaceId);
      }, [] as BusinessSale[]),
      loadSource(() => listWorkspaceRecipes(workspaceId), [] as Recipe[]),
      loadSource(() => getWorkspaceAiUsage(workspaceId), emptyAiUsage),
      loadSource(() => listPendingRecalculations(workspaceId), [] as PendingRecipeCostRecalculation[])
    ]);

    return { invoices, ingredients, suppliers, quotations, sales, recipes, aiUsage, recalculations };
  }
};
