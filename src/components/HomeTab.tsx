/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CalendarDays,
  ClipboardList,
  FileUp,
  PackagePlus,
  PackageSearch,
  Plus,
  ReceiptText,
  Store,
  TrendingUp
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { ChefProfile, DEFAULT_CHEF_PROFILE, Recipe, RootTab } from '../types';
import { db } from '../firebase';
import { ingredientService, invoiceService } from '../modules/costing/services';
import type { CostingIngredient, CostingInvoice } from '../modules/costing/types';
import { supplierService } from '../modules/suppliers/services';
import { businessService } from '../modules/business/services';
import { subscriptionService } from '../services/subscriptionService';
import { UNLIMITED_PLAN_LIMIT } from '../services/subscriptionPlans';
import { getCustomerFriendlyErrorMessage, isPermissionError } from '../utils/customerErrorMessages';
import type { Supplier, SupplierQuotation } from '../modules/suppliers/types';
import type { BusinessSale } from '../modules/business/types';

interface HomePortfolioSummary {
  professionalTitle?: string;
  yearsExperience?: string;
  bio?: string;
  quote?: string;
}

interface HomeTabProps {
  recipes: Recipe[];
  selectedCategory?: string | null;
  isFavoritesFilter?: boolean;
  onSelectRecipe: (recipe: Recipe) => void;
  onToggleFavorite: (recipeId: string) => void;
  currentUser?: User | null;
  workspaceId?: string;
  profile?: ChefProfile;
  customAvatarUrl?: string;
  portfolio?: HomePortfolioSummary;
  onCreateRecipe?: () => void;
  onNavigate?: (tab: RootTab) => void;
}

interface AiUsageQuotaSummary {
  todayRequests: number;
  monthRequests: number;
  monthlyLimit: number;
}

interface DashboardState {
  invoices: CostingInvoice[];
  ingredients: CostingIngredient[];
  suppliers: Supplier[];
  quotations: SupplierQuotation[];
  sales: BusinessSale[];
  aiUsage: AiUsageQuotaSummary;
  pendingRecalculations: number;
}

interface ActivityItem {
  id: string;
  label: string;
  detail: string;
  timestamp: string;
  tone: 'primary' | 'secondary' | 'warning';
}

const CHEF_PROFILE_STORAGE_KEY = 'ce_lims_kitchen_chef_profile_v1';
const TARGET_PURCHASE_RATIO_STORAGE_PREFIX = 'misechef_target_purchase_ratio_';

const emptyDashboard: DashboardState = {
  invoices: [],
  ingredients: [],
  suppliers: [],
  quotations: [],
  sales: [],
  aiUsage: { todayRequests: 0, monthRequests: 0, monthlyLimit: 25 },
  pendingRecalculations: 0
};

const formatDate = (date = new Date()) => new Intl.DateTimeFormat('en-SG', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric'
}).format(date);

const formatShortDate = (value?: string | null) => value ? value.slice(0, 10) : 'Today';

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
};

const isSameDay = (value?: string | null, target = new Date()) => {
  if (!value) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime())
    && parsed.getFullYear() === target.getFullYear()
    && parsed.getMonth() === target.getMonth()
    && parsed.getDate() === target.getDate();
};

const toTime = (value?: string | null) => {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
};

const isExpiringSoon = (value?: string | null) => {
  if (!value) return false;
  const expiry = new Date(value).getTime();
  if (Number.isNaN(expiry)) return false;
  const now = new Date();
  const inFourteenDays = new Date();
  inFourteenDays.setDate(now.getDate() + 14);
  return expiry >= now.getTime() && expiry <= inFourteenDays.getTime();
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

const getInvoiceStatus = (invoice: CostingInvoice) => invoice.processingStatus || invoice.status;
const getInvoiceTotal = (invoice: CostingInvoice) => Number(invoice.total ?? invoice.extractedData?.total ?? 0);
const getInvoiceBusinessDate = (invoice: CostingInvoice) => invoice.invoiceDate || invoice.extractedData?.invoiceDate || invoice.processingCompletedAt || invoice.uploadDate;

const safeListQuotations = async (workspaceId: string) => {
  if (!db) return [];

  const readCollection = async (collectionName: string) => {
    const quotationQuery = query(collection(db, collectionName), where('workspaceId', '==', workspaceId));
    const snapshot = await getDocs(quotationQuery);
    return snapshot.docs.map(docSnapshot => normalizeQuotation(docSnapshot.id, docSnapshot.data() as Record<string, unknown>));
  };

  try {
    const [supplierQuotations, quotations] = await Promise.all([
      readCollection('supplierQuotations'),
      readCollection('quotations')
    ]);
    return [...supplierQuotations, ...quotations];
  } catch (err) {
    return [];
  }
};

const isSameMonth = (value?: string | null, target = new Date()) => {
  if (!value) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime())
    && parsed.getFullYear() === target.getFullYear()
    && parsed.getMonth() === target.getMonth();
};


const safeGetAiUsageQuota = async (userId: string, workspaceId = userId): Promise<AiUsageQuotaSummary> => {
  const subscription = await subscriptionService.getCompanySubscription(workspaceId).catch(() => null);
  const monthlyLimit = subscription?.limits.monthlyAiRequests ?? 25;

  if (!db) return { todayRequests: 0, monthRequests: 0, monthlyLimit };

  try {
    const aiQuery = query(collection(db, 'ai_usage'), where('companyId', '==', workspaceId));
    const snapshot = await getDocs(aiQuery);
    const records = snapshot.docs.map(docSnapshot => docSnapshot.data() as Record<string, unknown>);

    return {
      todayRequests: records.filter(record => isSameDay(readTimestamp(record.createdAt) || readTimestamp(record.timestamp))).length,
      monthRequests: records.filter(record => isSameMonth(readTimestamp(record.createdAt) || readTimestamp(record.timestamp))).length,
      monthlyLimit
    };
  } catch (err) {
    return { todayRequests: 0, monthRequests: 0, monthlyLimit };
  }
};

const getPurchaseRatioStatus = (purchaseRatio: number | null, targetRatio: number) => {
  if (purchaseRatio === null) return { label: 'No sales', tone: 'warning' as const, className: 'bg-surface-container-high text-on-surface-variant' };
  if (purchaseRatio > targetRatio) return { label: '🔴 Over Target', tone: 'warning' as const, className: 'bg-red-100 text-red-800' };
  if (purchaseRatio >= targetRatio * 0.9) return { label: '🟡 Warning', tone: 'warning' as const, className: 'bg-yellow-100 text-yellow-800' };
  return { label: '🟢 Healthy', tone: 'secondary' as const, className: 'bg-green-100 text-green-800' };
};

const safeGetPendingRecalculations = async (workspaceId: string) => {
  if (!db) return 0;

  try {
    const recalculationQuery = query(collection(db, 'recipeCostRecalculations'), where('workspaceId', '==', workspaceId));
    const snapshot = await getDocs(recalculationQuery);
    return snapshot.docs.filter(docSnapshot => docSnapshot.data().status === 'Pending').length;
  } catch (err) {
    return 0;
  }
};

export default function HomeTab({
  recipes,
  currentUser = null,
  workspaceId,
  profile: sharedProfile,
  customAvatarUrl = '',
  onCreateRecipe,
  onNavigate
}: HomeTabProps) {
  const [localProfile, setLocalProfile] = useState<ChefProfile>(DEFAULT_CHEF_PROFILE);
  const [dashboard, setDashboard] = useState<DashboardState>(emptyDashboard);
  const [isLoading, setIsLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState('');
  const [targetPurchaseRatio, setTargetPurchaseRatio] = useState(30);

  const profile = sharedProfile || localProfile;
  const displayName = profile.name || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Chef';
  const userId = currentUser?.uid;
  const activeWorkspaceId = workspaceId || userId;

  useEffect(() => {
    const cachedProfile = localStorage.getItem(CHEF_PROFILE_STORAGE_KEY);
    if (!cachedProfile) {
      setLocalProfile(DEFAULT_CHEF_PROFILE);
      return;
    }

    try {
      setLocalProfile({ ...DEFAULT_CHEF_PROFILE, ...JSON.parse(cachedProfile) });
    } catch (err) {
      setLocalProfile(DEFAULT_CHEF_PROFILE);
    }
  }, []);

  const loadDashboard = useCallback(async () => {
    if (!userId || !activeWorkspaceId) {
      setDashboard(emptyDashboard);
      return;
    }

    setIsLoading(true);
    setDashboardError('');
    let firstNonPermissionError: unknown = null;

    const safeLoad = async <T,>(loader: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await loader();
      } catch (err) {
        if (!isPermissionError(err) && !firstNonPermissionError) {
          firstNonPermissionError = err;
        }
        return fallback;
      }
    };

    try {
      const [invoices, ingredients, suppliers, quotations, sales, aiUsage, pendingRecalculations] = await Promise.all([
        safeLoad(() => invoiceService.listInvoices(userId, { includeArchived: false, workspaceId: activeWorkspaceId }), [] as CostingInvoice[]),
        safeLoad(() => ingredientService.listIngredients(activeWorkspaceId), [] as CostingIngredient[]),
        safeLoad(() => supplierService.listSuppliers(activeWorkspaceId, { searchTerm: '', status: 'Active' }), [] as Supplier[]),
        safeLoad(() => safeListQuotations(activeWorkspaceId), [] as SupplierQuotation[]),
        safeLoad(() => businessService.listSales(activeWorkspaceId), [] as BusinessSale[]),
        safeLoad(() => safeGetAiUsageQuota(userId, activeWorkspaceId), emptyDashboard.aiUsage),
        safeLoad(() => safeGetPendingRecalculations(activeWorkspaceId), 0)
      ]);

      setDashboard({ invoices, ingredients, suppliers, quotations, sales, aiUsage, pendingRecalculations });
      if (firstNonPermissionError) {
        setDashboardError(getCustomerFriendlyErrorMessage(firstNonPermissionError, "We couldn't refresh your dashboard. Please refresh the page or try again."));
      }
    } finally {
      setIsLoading(false);
    }
  }, [activeWorkspaceId, userId]);

  useEffect(() => {
    loadDashboard();
    window.addEventListener('misechef:invoice-lifecycle-changed', loadDashboard);
    window.addEventListener('misechef:sales-changed', loadDashboard);
    return () => {
      window.removeEventListener('misechef:invoice-lifecycle-changed', loadDashboard);
      window.removeEventListener('misechef:sales-changed', loadDashboard);
    };
  }, [loadDashboard]);

  useEffect(() => {
    if (!activeWorkspaceId) {
      setTargetPurchaseRatio(30);
      return;
    }

    const storedTarget = localStorage.getItem(`${TARGET_PURCHASE_RATIO_STORAGE_PREFIX}${activeWorkspaceId}`);
    const parsedTarget = storedTarget ? Number(storedTarget) : 30;
    setTargetPurchaseRatio(Number.isFinite(parsedTarget) && parsedTarget > 0 ? parsedTarget : 30);
  }, [activeWorkspaceId]);

  const handleTargetPurchaseRatioChange = (value: string) => {
    const nextTarget = Number(value);
    if (!Number.isFinite(nextTarget) || nextTarget <= 0) return;

    setTargetPurchaseRatio(nextTarget);
    if (activeWorkspaceId) {
      localStorage.setItem(`${TARGET_PURCHASE_RATIO_STORAGE_PREFIX}${activeWorkspaceId}`, String(nextTarget));
    }
  };

  const pendingInvoices = useMemo(
    () => dashboard.invoices.filter(invoice => ['Pending', 'Processing'].includes(getInvoiceStatus(invoice))).length,
    [dashboard.invoices]
  );
  const activeIngredients = useMemo(
    () => dashboard.ingredients.filter(ingredient => ingredient.status === 'Active'),
    [dashboard.ingredients]
  );
  const missingIngredientPrices = useMemo(
    () => activeIngredients.filter(ingredient => Number(ingredient.currentPrice || 0) <= 0).length,
    [activeIngredients]
  );
  const expiringQuotations = useMemo(
    () => dashboard.quotations.filter(quotation => isExpiringSoon(quotation.expiryDate)).length,
    [dashboard.quotations]
  );
  const todaySales = useMemo(
    () => dashboard.sales.filter(sale => isSameDay(sale.date)).reduce((sum, sale) => sum + Number(sale.amount || 0), 0),
    [dashboard.sales]
  );
  const pendingOcrReview = useMemo(
    () => dashboard.invoices.filter(invoice => getInvoiceStatus(invoice) === 'Processed' && Boolean(invoice.extractedData)).length,
    [dashboard.invoices]
  );
  const pendingImports = useMemo(
    () => dashboard.invoices.filter(invoice => getInvoiceStatus(invoice) === 'Processed').length,
    [dashboard.invoices]
  );
  const monthSales = useMemo(
    () => dashboard.sales.filter(sale => isSameMonth(sale.date)).reduce((sum, sale) => sum + Number(sale.amount || 0), 0),
    [dashboard.sales]
  );
  const monthPurchases = useMemo(
    () => dashboard.invoices
      .filter(invoice => getInvoiceStatus(invoice) === 'Imported')
      .filter(invoice => isSameMonth(getInvoiceBusinessDate(invoice)))
      .reduce((sum, invoice) => sum + getInvoiceTotal(invoice), 0),
    [dashboard.invoices]
  );
  const purchaseRatio = monthSales > 0 ? (monthPurchases / monthSales) * 100 : null;
  const purchaseRatioDifference = purchaseRatio === null ? null : purchaseRatio - targetPurchaseRatio;
  const purchaseRatioStatus = getPurchaseRatioStatus(purchaseRatio, targetPurchaseRatio);
  const maximumAllowedPurchases = monthSales * (targetPurchaseRatio / 100);
  const remainingPurchaseAllowance = maximumAllowedPurchases - monthPurchases;
  const amountOverTarget = Math.max(0, monthPurchases - maximumAllowedPurchases);

  const aiMonthlyLimit = dashboard.aiUsage.monthlyLimit;
  const aiRemainingRequests = aiMonthlyLimit === UNLIMITED_PLAN_LIMIT
    ? UNLIMITED_PLAN_LIMIT
    : Math.max(0, aiMonthlyLimit - dashboard.aiUsage.monthRequests);
  const aiUsagePercentage = aiMonthlyLimit === UNLIMITED_PLAN_LIMIT || aiMonthlyLimit <= 0
    ? 0
    : (dashboard.aiUsage.monthRequests / aiMonthlyLimit) * 100;
  const aiUsageStatus = aiMonthlyLimit !== UNLIMITED_PLAN_LIMIT && dashboard.aiUsage.monthRequests >= aiMonthlyLimit
    ? 'Limit Reached'
    : aiUsagePercentage >= 80
      ? 'Near Limit'
      : 'Healthy';
  const aiUsageTone = aiUsageStatus === 'Limit Reached' || aiUsageStatus === 'Near Limit' ? 'warning' : 'secondary';
  const aiLimitLabel = aiMonthlyLimit === UNLIMITED_PLAN_LIMIT ? 'Unlimited' : String(aiMonthlyLimit);
  const aiRemainingLabel = aiRemainingRequests === UNLIMITED_PLAN_LIMIT ? 'Unlimited' : String(aiRemainingRequests);

  const needsAttention = [
    pendingInvoices > 0 ? { id: 'pending-invoices', title: `${pendingInvoices} pending invoice${pendingInvoices === 1 ? '' : 's'}`, detail: 'Review uploaded invoices and finish processing.', tone: 'warning' as const } : null,
    expiringQuotations > 0 ? { id: 'expiring-quotations', title: `${expiringQuotations} quotation${expiringQuotations === 1 ? '' : 's'} expiring soon`, detail: 'Confirm supplier pricing before it expires.', tone: 'warning' as const } : null,
    dashboard.pendingRecalculations > 0 ? { id: 'cost-recalculation', title: `${dashboard.pendingRecalculations} recipe cost update${dashboard.pendingRecalculations === 1 ? '' : 's'} pending`, detail: 'Ingredient costs changed and recipes need recalculation.', tone: 'warning' as const } : null,
    missingIngredientPrices > 0 ? { id: 'missing-prices', title: `${missingIngredientPrices} ingredient${missingIngredientPrices === 1 ? '' : 's'} missing prices`, detail: 'Add current prices so costing can stay accurate.', tone: 'warning' as const } : null
  ].filter(Boolean);

  const dailyOperationCards = [
    { label: "Today's Sales", value: `SGD ${todaySales.toFixed(2)}`, icon: <TrendingUp className="h-5 w-5" />, helper: 'Recorded from Business Sales', tone: 'secondary' },
    { label: 'Pending Invoices', value: String(pendingInvoices), icon: <ReceiptText className="h-5 w-5" />, helper: pendingInvoices ? 'Waiting for OCR processing' : 'No invoices waiting', tone: pendingInvoices ? 'warning' : 'primary' },
    { label: 'Pending OCR Review', value: String(pendingOcrReview), icon: <ClipboardList className="h-5 w-5" />, helper: pendingOcrReview ? 'Review extracted invoice data' : 'No OCR reviews waiting', tone: pendingOcrReview ? 'warning' : 'primary' },
    { label: 'Pending Imports', value: String(pendingImports), icon: <PackageSearch className="h-5 w-5" />, helper: pendingImports ? 'Approve processed invoices' : 'No imports waiting', tone: pendingImports ? 'warning' : 'primary' },
    {
      label: 'AI Usage',
      value: `${dashboard.aiUsage.monthRequests} / ${aiLimitLabel}`,
      icon: <Bot className="h-5 w-5" />,
      helper: `Today ${dashboard.aiUsage.todayRequests} • Remaining ${aiRemainingLabel} • ${aiUsageStatus}`,
      tone: aiUsageTone
    },
    { label: 'Alerts', value: String(needsAttention.length), icon: <AlertTriangle className="h-5 w-5" />, helper: needsAttention.length ? 'Items need attention' : 'Nothing urgent right now', tone: needsAttention.length ? 'warning' : 'secondary' }
  ];

  const businessPerformanceCards = [
    { label: 'This Month Sales', value: `SGD ${monthSales.toFixed(2)}`, icon: <TrendingUp className="h-5 w-5" />, helper: 'Recorded sales this month', tone: 'secondary' },
    { label: 'This Month Purchases', value: `SGD ${monthPurchases.toFixed(2)}`, icon: <ReceiptText className="h-5 w-5" />, helper: 'Imported invoice totals this month', tone: 'primary' },
    { label: 'Purchase Ratio', value: purchaseRatio === null ? '-' : `${purchaseRatio.toFixed(1)}%`, icon: <ClipboardList className="h-5 w-5" />, helper: 'Purchases divided by sales', tone: purchaseRatioStatus.tone, statusClassName: purchaseRatioStatus.className },
    { label: 'Target Purchase Ratio', value: `${targetPurchaseRatio}%`, icon: <TrendingUp className="h-5 w-5" />, helper: 'Workspace target', tone: 'secondary' },
    {
      label: 'Remaining Purchase Allowance',
      value: `SGD ${Math.max(0, remainingPurchaseAllowance).toFixed(2)}`,
      icon: <ReceiptText className="h-5 w-5" />,
      helper: amountOverTarget > 0 ? `Amount over target: SGD ${amountOverTarget.toFixed(2)}` : 'Still available this month',
      tone: amountOverTarget > 0 ? 'warning' : 'secondary'
    },
    {
      label: 'Status',
      value: purchaseRatioStatus.label,
      icon: <AlertTriangle className="h-5 w-5" />,
      helper: purchaseRatio === null ? 'Needs monthly sales' : purchaseRatioDifference !== null && purchaseRatioDifference > 0 ? `Current ${purchaseRatio.toFixed(1)}% vs target ${targetPurchaseRatio}%` : 'Purchasing is within target',
      tone: purchaseRatioStatus.tone,
      statusClassName: purchaseRatioStatus.className
    }
  ];

  const recentActivity = useMemo<ActivityItem[]>(() => {
    const recipeActivities = recipes.slice(0, 6).map(recipe => ({
      id: `recipe-${recipe.id}`,
      label: 'Recipe updated',
      detail: recipe.title,
      timestamp: recipe.createdAt || '',
      tone: 'primary' as const
    }));

    const invoiceActivities = dashboard.invoices.slice(0, 6).map(invoice => ({
      id: `invoice-${invoice.id}`,
      label: `${getInvoiceStatus(invoice)} invoice`,
      detail: invoice.fileName,
      timestamp: invoice.uploadDate,
      tone: getInvoiceStatus(invoice) === 'Failed' ? 'warning' as const : 'secondary' as const
    }));

    const supplierActivities = dashboard.suppliers.slice(0, 6).map(supplier => ({
      id: `supplier-${supplier.id}`,
      label: 'Supplier updated',
      detail: supplier.companyName,
      timestamp: supplier.updatedAt,
      tone: 'primary' as const
    }));

    const ingredientActivities = dashboard.ingredients.slice(0, 6).map(ingredient => ({
      id: `ingredient-${ingredient.id}`,
      label: 'Ingredient updated',
      detail: ingredient.name,
      timestamp: ingredient.updatedAt,
      tone: Number(ingredient.currentPrice || 0) <= 0 ? 'warning' as const : 'primary' as const
    }));

    return [...invoiceActivities, ...supplierActivities, ...ingredientActivities, ...recipeActivities]
      .filter(item => item.timestamp)
      .sort((a, b) => toTime(b.timestamp) - toTime(a.timestamp))
      .slice(0, 8);
  }, [dashboard.ingredients, dashboard.invoices, dashboard.suppliers, recipes]);

  const quickActions = [
    { label: 'Upload Invoice', detail: 'Add supplier invoices', icon: <FileUp className="h-5 w-5" />, onClick: () => onNavigate?.('costing') },
    { label: 'Create Recipe', detail: 'Build a new recipe', icon: <Plus className="h-5 w-5" />, onClick: onCreateRecipe },
    { label: 'Add Ingredient', detail: 'Update ingredient library', icon: <PackagePlus className="h-5 w-5" />, onClick: () => onNavigate?.('costingIngredients') },
    { label: 'Add Supplier', detail: 'Manage supplier records', icon: <Store className="h-5 w-5" />, onClick: () => onNavigate?.('businessSuppliers') }
  ];

  const snapshotItems = [
    { label: 'Recipes', value: recipes.length },
    { label: 'Ingredients', value: activeIngredients.length },
    { label: 'Suppliers', value: dashboard.suppliers.length },
    { label: 'Invoices', value: dashboard.invoices.length }
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <section className="rounded-2xl border border-surface-container-high bg-surface-container-low p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-secondary/10 px-3 py-1 font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">
              <CalendarDays className="h-3.5 w-3.5" /> {formatDate()}
            </div>
            <div>
              <h1 className="font-display text-4xl font-bold tracking-tight text-primary sm:text-5xl">
                {getGreeting()}, {displayName}
              </h1>
              <p className="mt-3 max-w-2xl font-sans text-sm font-bold leading-relaxed text-on-surface-variant">
                Your daily restaurant command center: sales, invoice workflow, purchasing trends, and alerts without misleading food-cost shortcuts.
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-surface-container-high bg-white px-5 py-4 shadow-sm">
            <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.16em] text-outline">Purchase Ratio</p>
            <p className="mt-1 font-display text-2xl font-bold text-primary">{purchaseRatio === null ? '-' : `${purchaseRatio.toFixed(1)}%`}</p>
            <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 font-sans text-[10px] font-extrabold ${purchaseRatioStatus.className}`}>{purchaseRatioStatus.label}</span>
          </div>
        </div>
      </section>

      {dashboardError && (
        <p className="rounded-2xl border border-error/30 bg-error/10 p-4 font-sans text-sm font-bold text-error">{dashboardError}</p>
      )}

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-primary">Daily Operations</p>
            <p className="mt-1 font-sans text-sm font-bold text-on-surface-variant">Today’s sales, invoice workflow, AI quota, and operational alerts.</p>
          </div>
          {isLoading && <p className="font-sans text-xs font-extrabold text-outline">Refreshing...</p>}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {dailyOperationCards.map(card => (
            <article key={card.label} className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm">
              <span className={`inline-flex rounded-full p-2 ${card.tone === 'warning' ? 'bg-yellow-100 text-yellow-800' : card.tone === 'secondary' ? 'bg-secondary/10 text-secondary' : 'bg-primary/10 text-primary'}`}>
                {card.icon}
              </span>
              <p className="mt-5 font-sans text-[10px] font-extrabold uppercase tracking-[0.16em] text-outline">{card.label}</p>
              <p className="mt-2 font-display text-2xl font-bold text-primary">{isLoading ? '...' : card.value}</p>
              <p className="mt-2 font-sans text-xs font-bold text-on-surface-variant">{card.helper}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-primary">Monthly Business Performance</p>
            <p className="mt-1 font-sans text-sm font-bold text-on-surface-variant">Purchasing control against current monthly sales. This is not actual food cost.</p>
          </div>
          <label className="flex items-center gap-3 rounded-2xl border border-surface-container-high bg-white px-4 py-3 shadow-sm">
            <span className="font-sans text-xs font-extrabold uppercase tracking-[0.14em] text-outline">Target Purchase Ratio</span>
            <select
              value={targetPurchaseRatio}
              onChange={event => handleTargetPurchaseRatioChange(event.target.value)}
              className="rounded-xl border border-surface-container-high bg-surface-container-low px-3 py-2 font-sans text-sm font-extrabold text-primary outline-none focus:border-primary"
            >
              {[28, 30, 32, 35].map(option => (
                <option key={option} value={option}>{option}%</option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {businessPerformanceCards.map(card => (
            <article key={card.label} className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm">
              <span className={`inline-flex rounded-full p-2 ${card.tone === 'warning' ? 'bg-yellow-100 text-yellow-800' : card.tone === 'secondary' ? 'bg-secondary/10 text-secondary' : 'bg-primary/10 text-primary'}`}>
                {card.icon}
              </span>
              <p className="mt-5 font-sans text-[10px] font-extrabold uppercase tracking-[0.16em] text-outline">{card.label}</p>
              <p className="mt-2 font-display text-2xl font-bold text-primary">{isLoading ? '...' : card.value}</p>
              {card.statusClassName ? (
                <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 font-sans text-[10px] font-extrabold ${card.statusClassName}`}>{card.helper}</span>
              ) : (
                <p className="mt-2 font-sans text-xs font-bold text-on-surface-variant">{card.helper}</p>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm">
          <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-primary">Quick Actions</p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {quickActions.map(action => (
              <button
                key={action.label}
                type="button"
                onClick={action.onClick}
                className="flex items-center gap-4 rounded-2xl border border-surface-container-high bg-surface-container-low p-4 text-left transition-all hover:border-primary/30 hover:bg-primary/5 active:scale-[0.99]"
              >
                <span className="rounded-full bg-primary px-3 py-3 text-on-primary">{action.icon}</span>
                <span>
                  <span className="block font-sans text-sm font-extrabold text-primary">{action.label}</span>
                  <span className="mt-1 block font-sans text-xs font-bold text-on-surface-variant">{action.detail}</span>
                </span>
              </button>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-primary">Needs Attention</p>
              <p className="mt-1 font-sans text-sm font-bold text-on-surface-variant">Operational items that could affect today’s work.</p>
            </div>
            <AlertTriangle className="h-5 w-5 text-outline" />
          </div>
          <div className="mt-4 space-y-3">
            {needsAttention.length > 0 ? needsAttention.map(item => item && (
              <div key={item.id} className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
                <p className="font-sans text-sm font-extrabold text-yellow-900">{item.title}</p>
                <p className="mt-1 font-sans text-xs font-bold text-yellow-800">{item.detail}</p>
              </div>
            )) : (
              <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                <p className="font-sans text-sm font-extrabold text-green-900">Nothing urgent right now.</p>
                <p className="mt-1 font-sans text-xs font-bold text-green-800">Invoices, supplier pricing, ingredient prices, and recipe cost queues look clear.</p>
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm">
          <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-primary">Recent Activity</p>
          <div className="mt-4 space-y-3">
            {recentActivity.length > 0 ? recentActivity.map(item => (
              <div key={item.id} className="flex items-start justify-between gap-4 rounded-xl border border-surface-container-high bg-surface-container-low p-4">
                <div>
                  <p className="font-sans text-sm font-extrabold text-primary">{item.label}</p>
                  <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">{item.detail}</p>
                </div>
                <span className="shrink-0 rounded-full bg-white px-3 py-1 font-sans text-[10px] font-extrabold text-outline">{formatShortDate(item.timestamp)}</span>
              </div>
            )) : (
              <div className="rounded-xl border border-surface-container-high bg-surface-container-low p-4">
                <p className="font-sans text-sm font-extrabold text-primary">No business activity recorded yet.</p>
                <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">Use quick actions to start today’s work.</p>
              </div>
            )}
          </div>
        </article>

        <article className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-primary">Business Snapshot</p>
              <p className="mt-1 font-sans text-sm font-bold text-on-surface-variant">Current operating data.</p>
            </div>
            <TrendingUp className="h-5 w-5 text-outline" />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {snapshotItems.map(item => (
              <div key={item.label} className="rounded-xl border border-surface-container-high bg-surface-container-low p-4 text-center">
                <p className="font-display text-2xl font-bold text-primary">{isLoading ? '...' : item.value}</p>
                <p className="mt-1 font-sans text-[10px] font-extrabold uppercase tracking-[0.14em] text-outline">{item.label}</p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
