/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  ClipboardList,
  FileUp,
  PackagePlus,
  PackageSearch,
  Plus,
  ReceiptText,
  Store,
  TrendingUp
} from 'lucide-react';
import {
  OwnerBusinessSnapshot,
  OwnerHomeHeader,
  OwnerMetricSection,
  OwnerNeedsAttention,
  OwnerQuickActions,
  OwnerRecentActivity
} from './home/OwnerHomeWidgets';
import type { OwnerMetricState } from './home/OwnerHomeWidgets';
import type { User } from 'firebase/auth';
import { ChefProfile, Recipe, RootTab, WorkspaceMemberRole } from '../types';
import ChefHome from './home/ChefHome';
import FirstTimeHome from './home/FirstTimeHome';
import TodaysTasks from './home/TodaysTasks';
import type { CostingInvoice } from '../modules/costing/types';
import { dashboardService, type DashboardSource, type OwnerDashboardData } from '../services/dashboardService';
import { getAuthenticatedGreeting } from '../utils/authenticatedUser';

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
  workspaceRole?: WorkspaceMemberRole | null;
  allRecipes?: Recipe[];
}

interface ActivityItem {
  id: string;
  label: string;
  detail: string;
  timestamp: string;
  tone: 'primary' | 'secondary' | 'warning';
}

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

const isSameMonth = (value?: string | null, target = new Date()) => {
  if (!value) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime())
    && parsed.getFullYear() === target.getFullYear()
    && parsed.getMonth() === target.getMonth();
};

const getInvoiceStatus = (invoice: CostingInvoice) => invoice.processingStatus || invoice.status;
const getInvoiceTotal = (invoice: CostingInvoice) => Number(invoice.total ?? invoice.extractedData?.total ?? 0);
const getInvoiceBusinessDate = (invoice: CostingInvoice) => invoice.invoiceDate || invoice.extractedData?.invoiceDate || invoice.processingCompletedAt || invoice.uploadDate;

const getMetricState = <T,>(source: DashboardSource<T> | undefined, hasData: boolean, isLoading: boolean): OwnerMetricState => {
  if (isLoading) return 'loading';
  if (!source) return 'no-data';
  if (source.status === 'permission-denied') return 'permission-denied';
  if (source.status === 'error') return 'error';
  return hasData ? 'ready' : 'no-data';
};

export default function HomeTab({
  recipes,
  allRecipes = recipes,
  currentUser = null,
  workspaceId,
  onCreateRecipe,
  onNavigate,
  onSelectRecipe,
  onToggleFavorite,
  workspaceRole = null
}: HomeTabProps) {
  const [dashboard, setDashboard] = useState<OwnerDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState('');

  const userId = currentUser?.uid;
  const activeWorkspaceId = workspaceId || userId;
  const isChefHome = workspaceRole === 'Chef';
  const firstTimeGreeting = getAuthenticatedGreeting('Welcome to MiseChef', currentUser);
  const chefHomeGreeting = getAuthenticatedGreeting('Welcome back', currentUser);
  const ownerHomeGreeting = getAuthenticatedGreeting(getGreeting(), currentUser);

  const loadDashboard = useCallback(async () => {
    if (!userId || !activeWorkspaceId) {
      setDashboard(null);
      return;
    }

    setIsLoading(true);
    setDashboardError('');

    try {
      if (isChefHome) {
        setDashboard(null);
        return;
      }
      const nextDashboard = await dashboardService.loadOwnerDashboard(userId, activeWorkspaceId);
      setDashboard(nextDashboard);
      const sources = Object.values(nextDashboard);
      const permissionFailures = sources.filter(source => source.status === 'permission-denied').length;
      const otherFailures = sources.filter(source => source.status === 'error').length;
      if (permissionFailures || otherFailures) {
        setDashboardError(permissionFailures
          ? 'Some dashboard data is unavailable because your workspace access does not permit it.'
          : "Some dashboard data couldn't be loaded. The affected widgets are marked below.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [activeWorkspaceId, isChefHome, userId]);

  useEffect(() => {
    loadDashboard();
    window.addEventListener('misechef:invoice-lifecycle-changed', loadDashboard);
    window.addEventListener('misechef:sales-changed', loadDashboard);
    return () => {
      window.removeEventListener('misechef:invoice-lifecycle-changed', loadDashboard);
      window.removeEventListener('misechef:sales-changed', loadDashboard);
    };
  }, [loadDashboard]);

  const invoices = dashboard?.invoices.data || [];
  const ingredients = dashboard?.ingredients.data || [];
  const suppliers = dashboard?.suppliers.data || [];
  const quotations = dashboard?.quotations.data || [];
  const sales = dashboard?.sales.data || [];
  const dashboardRecipes = dashboard?.recipes.data || [];
  const recalculations = dashboard?.recalculations.data || [];
  const aiUsage = dashboard?.aiUsage.data || { todayRequests: 0, monthRequests: 0, monthFailures: 0, recordCount: 0 };

  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const todaySalesRecords = sales.filter(sale => isSameDay(sale.date, now));
  const yesterdaySalesRecords = sales.filter(sale => isSameDay(sale.date, yesterday));
  const monthSalesRecords = sales.filter(sale => isSameMonth(sale.date, now));
  const todaySales = todaySalesRecords.reduce((sum, sale) => sum + Number(sale.amount || 0), 0);
  const yesterdaySales = yesterdaySalesRecords.reduce((sum, sale) => sum + Number(sale.amount || 0), 0);
  const monthSales = monthSalesRecords.reduce((sum, sale) => sum + Number(sale.amount || 0), 0);

  const approvedMonthInvoices = invoices
    .filter(invoice => getInvoiceStatus(invoice) === 'Imported' && Boolean(invoice.approvedAt))
    .filter(invoice => isSameMonth(getInvoiceBusinessDate(invoice), now));
  const monthPurchases = approvedMonthInvoices.reduce((sum, invoice) => sum + getInvoiceTotal(invoice), 0);
  const pendingOcr = invoices.filter(invoice => ['Pending', 'Processing'].includes(getInvoiceStatus(invoice))).length;
  const pendingInvoiceRecords = invoices.filter(invoice => getInvoiceStatus(invoice) === 'Processed');
  const pendingInvoices = pendingInvoiceRecords.length;
  const pendingInvoiceSuppliers = Array.from(new Set(
    pendingInvoiceRecords
      .map(invoice => invoice.supplier || invoice.extractedData?.supplier || '')
      .filter(Boolean)
  )).slice(0, 2);
  const ocrFailures = invoices.filter(invoice => getInvoiceStatus(invoice) === 'Failed').length;
  const invoiceImportFailures = invoices.filter(invoice => getInvoiceStatus(invoice) === 'Processed' && Boolean(invoice.errorMessage)).length;

  const activeIngredients = ingredients.filter(ingredient => ingredient.status === 'Active');
  const missingIngredientPrices = activeIngredients.filter(ingredient => Number(ingredient.currentPrice || 0) <= 0).length;
  const activeIngredientIds = new Set(activeIngredients.map(ingredient => ingredient.id));
  const missingIngredientReferenceRecipes = dashboard?.recipes.status === 'ready' && dashboard?.ingredients.status === 'ready'
    ? dashboardRecipes.filter(recipe => (recipe.ingredients || []).some(ingredient => (
      Boolean(ingredient.name?.trim()) && (!ingredient.ingredientId || !activeIngredientIds.has(ingredient.ingredientId))
    ))).length
    : 0;
  const expiringQuotations = quotations.filter(quotation => isExpiringSoon(quotation.expiryDate)).length;

  const todaySalesState = getMetricState(dashboard?.sales, todaySalesRecords.length > 0, isLoading);
  const yesterdaySalesState = getMetricState(dashboard?.sales, yesterdaySalesRecords.length > 0, isLoading);
  const monthSalesState = getMetricState(dashboard?.sales, monthSalesRecords.length > 0, isLoading);
  const purchaseState = getMetricState(dashboard?.invoices, approvedMonthInvoices.length > 0, isLoading);
  const invoiceCountState = getMetricState(dashboard?.invoices, invoices.length > 0, isLoading);
  const aiUsageState = getMetricState(dashboard?.aiUsage, aiUsage.recordCount > 0, isLoading);
  const purchaseRatioState: OwnerMetricState = isLoading
    ? 'loading'
    : monthSalesState === 'permission-denied' || purchaseState === 'permission-denied'
      ? 'permission-denied'
      : monthSalesState === 'error' || purchaseState === 'error'
        ? 'error'
        : monthSalesState === 'no-data' || purchaseState === 'no-data'
          ? 'no-data'
          : 'ready';
  const purchaseRatio = purchaseRatioState === 'ready' && monthSales > 0 ? (monthPurchases / monthSales) * 100 : null;

  const alertSources = [
    dashboard?.invoices,
    dashboard?.ingredients,
    dashboard?.quotations,
    dashboard?.recipes,
    dashboard?.recalculations,
    dashboard?.aiUsage
  ];
  const alertPermissionDenied = alertSources.some(source => source?.status === 'permission-denied');
  const alertFailed = alertSources.some(source => source?.status === 'error');
  const alertHasData = invoices.length > 0
    || ingredients.length > 0
    || quotations.length > 0
    || dashboardRecipes.length > 0
    || recalculations.length > 0
    || aiUsage.recordCount > 0;
  const alertState: OwnerMetricState = isLoading
    ? 'loading'
    : alertPermissionDenied
      ? 'permission-denied'
      : alertFailed
        ? 'error'
        : alertHasData
          ? 'ready'
          : 'no-data';
  const alertDataIncomplete = alertPermissionDenied || alertFailed;

  const needsAttention = [
    ocrFailures > 0 ? { id: 'ocr-failures', title: `${ocrFailures} OCR failure${ocrFailures === 1 ? '' : 's'}`, detail: 'Retry or review invoices that could not be processed.' } : null,
    invoiceImportFailures > 0 ? { id: 'invoice-import-failures', title: `${invoiceImportFailures} invoice import failure${invoiceImportFailures === 1 ? '' : 's'}`, detail: 'Review processed invoices with import errors.' } : null,
    pendingInvoices > 0 ? { id: 'pending-invoices', title: `${pendingInvoices} invoice${pendingInvoices === 1 ? '' : 's'} awaiting approval`, detail: 'Review extracted data and approve the invoice import.' } : null,
    recalculations.length > 0 ? { id: 'cost-recalculation', title: `${recalculations.length} recipe cost update${recalculations.length === 1 ? '' : 's'} pending`, detail: 'Ingredient costs changed and recipes require recalculation.' } : null,
    missingIngredientReferenceRecipes > 0 ? { id: 'missing-ingredient-references', title: `${missingIngredientReferenceRecipes} recipe${missingIngredientReferenceRecipes === 1 ? '' : 's'} missing ingredient references`, detail: 'Link recipe ingredients to the workspace ingredient library.' } : null,
    missingIngredientPrices > 0 ? { id: 'missing-prices', title: `${missingIngredientPrices} ingredient${missingIngredientPrices === 1 ? '' : 's'} missing prices`, detail: 'Add current prices so costing can stay accurate.' } : null,
    expiringQuotations > 0 ? { id: 'expiring-quotations', title: `${expiringQuotations} quotation${expiringQuotations === 1 ? '' : 's'} expiring soon`, detail: 'Confirm supplier pricing before it expires.' } : null,
    aiUsage.monthFailures > 0 ? { id: 'ai-failures', title: `${aiUsage.monthFailures} AI request failure${aiUsage.monthFailures === 1 ? '' : 's'} this month`, detail: 'Recent AI requests did not complete successfully.' } : null
  ].filter((item): item is { id: string; title: string; detail: string } => item !== null);

  const dailyOperationCards = [
    { label: 'Pending OCR', value: String(pendingOcr), icon: <ClipboardList className="h-5 w-5" />, helper: pendingOcr ? 'Waiting for OCR processing' : 'Actual pending count: 0', tone: pendingOcr ? 'warning' : 'primary', state: invoiceCountState },
    {
      label: 'Pending Invoices',
      value: String(pendingInvoices),
      icon: <PackageSearch className="h-5 w-5" />,
      helper: pendingInvoices
        ? `Waiting for import or approval${pendingInvoiceSuppliers.length ? ` • ${pendingInvoiceSuppliers.join(', ')}` : ''}`
        : 'Actual pending count: 0',
      tone: pendingInvoices ? 'warning' : 'primary',
      state: invoiceCountState,
      onClick: () => {
        onNavigate?.('costingInvoices');
        window.history.replaceState(null, '', '/app/costing/invoices?status=Processed');
      }
    },
    { label: 'AI Usage', value: String(aiUsage.monthRequests), icon: <Bot className="h-5 w-5" />, helper: `Today ${aiUsage.todayRequests} • Successful requests this month`, tone: aiUsage.monthFailures ? 'warning' : 'secondary', state: aiUsageState },
    { label: 'Alerts', value: String(needsAttention.length), icon: <AlertTriangle className="h-5 w-5" />, helper: needsAttention.length ? 'Operational items need attention' : 'Actual alert count: 0', tone: needsAttention.length ? 'warning' : 'secondary', state: alertState }
  ];

  const businessPerformanceCards = [
    { label: "Today's Sales", value: `SGD ${todaySales.toFixed(2)}`, icon: <TrendingUp className="h-5 w-5" />, helper: 'Recorded sales for today', tone: 'secondary', state: todaySalesState },
    { label: 'Yesterday Sales', value: `SGD ${yesterdaySales.toFixed(2)}`, icon: <TrendingUp className="h-5 w-5" />, helper: 'Recorded sales for yesterday', tone: 'secondary', state: yesterdaySalesState },
    { label: 'This Month Sales', value: `SGD ${monthSales.toFixed(2)}`, icon: <TrendingUp className="h-5 w-5" />, helper: 'Recorded sales this month', tone: 'secondary', state: monthSalesState },
    { label: 'Total Purchases', value: `SGD ${monthPurchases.toFixed(2)}`, icon: <ReceiptText className="h-5 w-5" />, helper: 'Approved imported invoices this month', tone: 'primary', state: purchaseState },
    { label: 'Purchase Ratio', value: purchaseRatio === null ? 'Not available' : `${purchaseRatio.toFixed(1)}%`, icon: <ClipboardList className="h-5 w-5" />, helper: purchaseRatioState === 'ready' && monthSales === 0 ? 'Sales total is an actual zero' : 'Total purchases divided by total sales', tone: 'secondary', state: purchaseRatioState }
  ];

  const recentActivity = useMemo<ActivityItem[]>(() => {
    const recipeActivities = dashboardRecipes.slice(0, 6).map(recipe => ({
      id: `recipe-${recipe.id}`,
      label: 'Recipe updated',
      detail: recipe.title,
      timestamp: recipe.createdAt || '',
      tone: 'primary' as const
    }));

    const invoiceActivities = invoices.slice(0, 6).map(invoice => ({
      id: `invoice-${invoice.id}`,
      label: `${getInvoiceStatus(invoice)} invoice`,
      detail: invoice.fileName,
      timestamp: invoice.uploadDate,
      tone: getInvoiceStatus(invoice) === 'Failed' ? 'warning' as const : 'secondary' as const
    }));

    const supplierActivities = suppliers.slice(0, 6).map(supplier => ({
      id: `supplier-${supplier.id}`,
      label: 'Supplier updated',
      detail: supplier.companyName,
      timestamp: supplier.updatedAt,
      tone: 'primary' as const
    }));

    const ingredientActivities = ingredients.slice(0, 6).map(ingredient => ({
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
  }, [dashboardRecipes, ingredients, invoices, suppliers]);

  const quickActions = [
    { label: 'Upload Invoice', detail: 'Add supplier invoices', icon: <FileUp className="h-5 w-5" />, onClick: () => onNavigate?.('costing') },
    { label: 'Create Recipe', detail: 'Build a new recipe', icon: <Plus className="h-5 w-5" />, onClick: onCreateRecipe },
    { label: 'Add Ingredient', detail: 'Update ingredient library', icon: <PackagePlus className="h-5 w-5" />, onClick: () => onNavigate?.('costingIngredients') },
    { label: 'Add Supplier', detail: 'Manage supplier records', icon: <Store className="h-5 w-5" />, onClick: () => onNavigate?.('businessSuppliers') }
  ];

  const snapshotItems = [
    { label: 'Recipes', value: String(dashboardRecipes.length), state: getMetricState(dashboard?.recipes, dashboardRecipes.length > 0, isLoading) },
    { label: 'Ingredients', value: String(activeIngredients.length), state: getMetricState(dashboard?.ingredients, activeIngredients.length > 0, isLoading) },
    { label: 'Suppliers', value: String(suppliers.length), state: getMetricState(dashboard?.suppliers, suppliers.length > 0, isLoading) },
    { label: 'Invoices', value: String(invoices.length), state: getMetricState(dashboard?.invoices, invoices.length > 0, isLoading) }
  ];
  const activitySources = [dashboard?.invoices, dashboard?.ingredients, dashboard?.suppliers, dashboard?.recipes];
  const activityDataIncomplete = activitySources.some(source => source?.status === 'permission-denied' || source?.status === 'error');
  const purchaseRatioHeader = purchaseRatioState === 'loading'
    ? { value: '...', label: 'Loading', className: 'bg-surface-container-high text-on-surface-variant' }
    : purchaseRatioState === 'permission-denied'
      ? { value: 'Access unavailable', label: 'Permission denied', className: 'bg-yellow-100 text-yellow-800' }
      : purchaseRatioState === 'error'
        ? { value: 'Unable to load', label: 'Error', className: 'bg-red-100 text-red-800' }
        : purchaseRatioState === 'no-data'
          ? { value: 'No data available', label: 'No data', className: 'bg-surface-container-high text-on-surface-variant' }
          : purchaseRatio === null
            ? { value: 'Not available', label: 'Sales total is zero', className: 'bg-surface-container-high text-on-surface-variant' }
            : { value: `${purchaseRatio.toFixed(1)}%`, label: 'Monthly actuals', className: 'bg-primary/10 text-primary' };

  if (isChefHome) {
    return (
      <ChefHome
        recipes={allRecipes}
        greeting={chefHomeGreeting}
        onSelectRecipe={onSelectRecipe}
        onToggleFavorite={onToggleFavorite}
        onCreateRecipe={onCreateRecipe}
        onNavigate={onNavigate}
        workspaceId={activeWorkspaceId}
        userId={userId}
      />
    );
  }

  const hasReliableOnboardingCounts = dashboard?.recipes.status === 'ready'
    && dashboard.invoices.status === 'ready'
    && dashboard.ingredients.status === 'ready';
  const shouldShowFirstTimeHome = hasReliableOnboardingCounts
    && dashboardRecipes.length === 0
    && invoices.length === 0
    && ingredients.length === 0;

  if (shouldShowFirstTimeHome) {
    return (
      <FirstTimeHome
        greeting={firstTimeGreeting}
        onCreateRecipe={onCreateRecipe}
        onCompleteProfile={() => onNavigate?.('profile')}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 animate-fade-in">
      <OwnerHomeHeader date={formatDate()} greeting={ownerHomeGreeting} purchaseRatio={purchaseRatioHeader.value} purchaseRatioLabel={purchaseRatioHeader.label} purchaseRatioClassName={purchaseRatioHeader.className} />

      <TodaysTasks workspaceId={activeWorkspaceId} userId={userId} />

      {dashboardError && (
        <div className="flex flex-col gap-3 rounded-2xl border border-error/30 bg-error/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-sans text-sm font-bold text-error">{dashboardError}</p>
          <button type="button" onClick={loadDashboard} disabled={isLoading} className="w-fit rounded-full border border-error/30 bg-white px-4 py-2 font-sans text-xs font-extrabold text-error disabled:opacity-50">
            {isLoading ? 'Retrying...' : 'Retry'}
          </button>
        </div>
      )}

      <OwnerMetricSection title="Daily Operations" description="Invoice workflow, actual AI usage, and operational alerts." cards={dailyOperationCards} isLoading={isLoading} />

      <OwnerMetricSection
        title="Monthly Business Performance"
        description="Recorded sales and approved invoice purchases. This is not actual food cost."
        cards={businessPerformanceCards}
        isLoading={isLoading}
      />

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <OwnerQuickActions actions={quickActions} />
        <OwnerNeedsAttention items={needsAttention} isIncomplete={alertDataIncomplete} />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <OwnerRecentActivity items={recentActivity} formatTimestamp={formatShortDate} isIncomplete={activityDataIncomplete} />
        <OwnerBusinessSnapshot items={snapshotItems} />
      </section>
    </div>
  );
}
