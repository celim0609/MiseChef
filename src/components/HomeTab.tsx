/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
import PersonalHome from './home/PersonalHome';
import FirstTimeHome from './home/FirstTimeHome';
import TodaysTasks from './home/TodaysTasks';
import OwnerSalesPerformance from './home/OwnerSalesPerformance';
import type { CostingInvoice } from '../modules/costing/types';
import { dashboardService, type DashboardSource, type OwnerDashboardData } from '../services/dashboardService';
import { getAuthenticatedGreeting } from '../utils/authenticatedUser';
import { selectProvisionedDisplayName } from '../services/newUserProvisioningModel';
import { formatRegionCurrency, useWorkspaceRegion } from '../regions';
import type { OnboardingGoal } from '../modules/onboarding';
import type { QuickAddActionDefinition, QuickAddActionId } from '../navigation/quickAdd';
import { getBusinessDashboardPeriodRange } from '../modules/business/accounting';
import { formatPurchaseCostPercentage } from '../modules/business/purchaseKpi';

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
  workspaceName?: string;
  canViewSalesRecords?: boolean;
  profile?: ChefProfile;
  customAvatarUrl?: string;
  portfolio?: HomePortfolioSummary;
  onCreateRecipe?: () => void;
  onNavigate?: (tab: RootTab, search?: string) => void;
  workspaceRole?: WorkspaceMemberRole | null;
  allRecipes?: Recipe[];
  onboardingGoals?: OnboardingGoal[];
  quickAddActions?: QuickAddActionDefinition[];
  onQuickAdd?: (action: QuickAddActionId) => void;
  businessEnabled?: boolean;
}

interface ActivityItem {
  id: string;
  label: string;
  detail: string;
  timestamp: string;
  tone: 'primary' | 'secondary' | 'warning';
}

const formatDate = (locale: string, timeZone: string, date: Date) => new Intl.DateTimeFormat(locale, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone
}).format(date);

const formatShortDate = (value?: string | null) => value ? value.slice(0, 10) : 'Today';

const getGreeting = (now: Date, timeZone: string) => {
  const hour = Number(new Intl.DateTimeFormat('en', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(now));
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
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

const getInvoiceStatus = (invoice: CostingInvoice) => invoice.processingStatus || invoice.status;

export default function HomeTab({
  recipes,
  allRecipes = recipes,
  currentUser = null,
  workspaceId,
  workspaceName,
  canViewSalesRecords = false,
  onCreateRecipe,
  onNavigate,
  onSelectRecipe,
  onToggleFavorite,
  workspaceRole = null,
  profile,
  onboardingGoals = [],
  quickAddActions = [],
  onQuickAdd,
  businessEnabled = false
}: HomeTabProps) {
  const region = useWorkspaceRegion();
  const [dashboard, setDashboard] = useState<OwnerDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const requestId = useRef(0);
  const [dashboardError, setDashboardError] = useState('');

  const userId = currentUser?.uid;
  const activeWorkspaceId = workspaceId || userId;
  const isChefHome = workspaceRole === 'Chef';
  const greetingIdentity = {
    displayName: selectProvisionedDisplayName({
      authDisplayName: currentUser?.displayName,
      profileName: profile?.name
    })
  };
  const firstTimeGreeting = getAuthenticatedGreeting('Welcome to MiseChef', greetingIdentity);
  const chefHomeGreeting = getAuthenticatedGreeting('Welcome back', greetingIdentity);
  const now = new Date();
  const ownerHomeGreeting = getAuthenticatedGreeting(getGreeting(now, region.timeZone), greetingIdentity);

  const loadDashboard = useCallback(async () => {
    const request = ++requestId.current;
    if (!businessEnabled || isChefHome || !userId || !activeWorkspaceId) {
      setDashboard(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setDashboardError('');

    try {
      const nextDashboard = await dashboardService.loadOwnerDashboard(userId, activeWorkspaceId, region.timeZone);
      if (request !== requestId.current) return;
      setDashboard(nextDashboard);
      const sources = Object.values(nextDashboard);
      const permissionFailures = sources.filter(source => source.status === 'permission-denied').length;
      const otherFailures = sources.filter(source => source.status === 'error').length;
      if (permissionFailures || otherFailures) {
        setDashboardError(permissionFailures
          ? 'Some dashboard data is unavailable because your workspace access does not permit it.'
          : "Some dashboard data couldn't be loaded. The affected widgets are marked below.");
      }
    } catch {
      if (request === requestId.current) {
        setDashboard(null);
        setDashboardError("Dashboard data couldn't be loaded. Please retry.");
      }
    } finally {
      if (request === requestId.current) setIsLoading(false);
    }
  }, [activeWorkspaceId, businessEnabled, isChefHome, region.timeZone, userId]);

  useEffect(() => {
    loadDashboard();
    window.addEventListener('misechef:invoice-lifecycle-changed', loadDashboard);
    window.addEventListener('misechef:sales-changed', loadDashboard);
    return () => {
      requestId.current++;
      window.removeEventListener('misechef:invoice-lifecycle-changed', loadDashboard);
      window.removeEventListener('misechef:sales-changed', loadDashboard);
    };
  }, [loadDashboard]);

  const dashboardFailed = !dashboard && Boolean(dashboardError);
  const getMetricState = <T,>(source: DashboardSource<T> | undefined, hasData: boolean): OwnerMetricState => {
    if (isLoading) return 'loading';
    if (dashboardFailed || source?.status === 'error') return 'error';
    if (source?.status === 'permission-denied') return 'permission-denied';
    return source && hasData ? 'ready' : 'no-data';
  };

  const invoices = dashboard?.invoices.data || [];
  const ingredients = dashboard?.ingredients.data || [];
  const suppliers = dashboard?.suppliers.data || [];
  const quotations = dashboard?.quotations.data || [];
  const dashboardRecipes = dashboard?.recipes.data || [];
  const recalculations = dashboard?.recalculations.data || [];
  const aiUsage = dashboard?.aiUsage.data || { todayRequests: 0, monthRequests: 0, monthFailures: 0, recordCount: 0 };

  const monthlySource = dashboard?.monthlyAccounting;
  const monthlySummary = monthlySource?.data;
  const monthSales = monthlySummary?.sales ?? 0;
  const monthPurchases = monthlySummary?.purchases ?? 0;
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

  const monthSalesState = getMetricState(monthlySource, Boolean(monthlySummary?.availability.sales));
  const purchaseState = getMetricState(monthlySource, Boolean(monthlySummary?.availability.purchases));
  const invoiceCountState = getMetricState(dashboard?.invoices, true);
  const aiUsageState = getMetricState(dashboard?.aiUsage, aiUsage.recordCount > 0);
  const purchaseRatioState = getMetricState(
    monthlySource,
    Boolean(monthlySummary && (monthlySummary.availability.purchases || monthSales <= 0))
  );
  const purchaseRatio = monthlySummary?.purchaseCostPercentage ?? null;

  const alertSources = [
    dashboard?.invoices,
    dashboard?.ingredients,
    dashboard?.quotations,
    dashboard?.recipes,
    dashboard?.recalculations,
    dashboard?.aiUsage
  ];
  const alertPermissionDenied = alertSources.some(source => source?.status === 'permission-denied');
  const alertFailed = dashboardFailed || alertSources.some(source => source?.status === 'error');
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
    { label: 'Pending OCR', value: String(pendingOcr), icon: <ClipboardList className="h-5 w-5" />, helper: pendingOcr ? 'Waiting for OCR processing' : 'None waiting', tone: pendingOcr ? 'warning' : 'primary', state: invoiceCountState },
    {
      label: 'Pending Invoices',
      value: String(pendingInvoices),
      icon: <PackageSearch className="h-5 w-5" />,
      helper: pendingInvoices
        ? `Waiting for import or approval${pendingInvoiceSuppliers.length ? ` • ${pendingInvoiceSuppliers.join(', ')}` : ''}`
        : 'None waiting',
      tone: pendingInvoices ? 'warning' : 'primary',
      state: invoiceCountState,
      onClick: onNavigate ? () => onNavigate('costingInvoices', '?status=Processed') : undefined
    },
    { label: 'AI Usage', value: String(aiUsage.monthRequests), icon: <Bot className="h-5 w-5" />, helper: `${aiUsage.todayRequests} today · Successful requests this month`, tone: aiUsage.monthFailures ? 'warning' : 'secondary', state: aiUsageState }
  ];

  const businessPerformanceCards = [
    { label: 'Total Revenue', value: formatRegionCurrency(monthSales, region.currency), icon: <TrendingUp className="h-5 w-5" />, helper: 'Recognized sales', tone: 'secondary', state: monthSalesState },
    { label: 'Approved Purchases', value: formatRegionCurrency(monthPurchases, region.currency), icon: <ReceiptText className="h-5 w-5" />, helper: 'Approved, imported invoices', tone: 'primary', state: purchaseState },
    { label: 'Purchase Ratio', value: formatPurchaseCostPercentage(purchaseRatio), icon: <ClipboardList className="h-5 w-5" />, helper: purchaseRatioState === 'ready' && purchaseRatio === null ? 'A positive sales total is needed for the ratio' : 'Approved purchases ÷ recognized sales', tone: 'secondary', state: purchaseRatioState }
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

  const quickActionIcons = { invoice: FileUp, recipe: Plus, ingredient: PackagePlus, supplier: Store };
  const quickActions = quickAddActions.map(action => {
    const Icon = quickActionIcons[action.id];
    return {
      label: action.label,
      detail: action.subtitle,
      icon: <Icon className="h-5 w-5" />,
      onClick: () => onQuickAdd?.(action.id)
    };
  });

  const snapshotItems = [
    { label: 'Recipes', value: String(dashboardRecipes.length), state: getMetricState(dashboard?.recipes, dashboardRecipes.length > 0) },
    { label: 'Ingredients', value: String(activeIngredients.length), state: getMetricState(dashboard?.ingredients, activeIngredients.length > 0) },
    { label: 'Suppliers', value: String(suppliers.length), state: getMetricState(dashboard?.suppliers, suppliers.length > 0) },
    { label: 'Invoices', value: String(invoices.length), state: getMetricState(dashboard?.invoices, true) }
  ];
  const activitySources = [dashboard?.invoices, dashboard?.ingredients, dashboard?.suppliers, dashboard?.recipes];
  const activityDataIncomplete = dashboardFailed || activitySources.some(source => source?.status === 'permission-denied' || source?.status === 'error');
  if (!businessEnabled) {
    return (
      <PersonalHome
        recipes={allRecipes}
        greeting={chefHomeGreeting}
        onCreateRecipe={onCreateRecipe}
        onNavigate={onNavigate}
        onSelectRecipe={onSelectRecipe}
      />
    );
  }

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
        goals={onboardingGoals}
        onCreateRecipe={onCreateRecipe}
        onCompleteProfile={() => onNavigate?.('portfolio')}
        onSetUpStore={() => onNavigate?.('store')}
      />
    );
  }

  const monthRange = getBusinessDashboardPeriodRange({ period: 'this-month', now, timeZone: region.timeZone })!;
  const monthDateFormat = new Intl.DateTimeFormat(region.locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const monthContext = monthDateFormat.formatRange(
    new Date(monthRange.from),
    new Date(monthRange.to)
  );

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0 space-y-4">
      <OwnerHomeHeader
        date={formatDate(region.locale, region.timeZone, now)}
        greeting={ownerHomeGreeting}
        workspaceName={workspaceName}
        monthContext={monthContext}
      />

      {dashboardError && (
        <div className="flex flex-col gap-3 rounded-2xl border border-error/30 bg-error/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p role="status" className="font-sans text-sm font-bold text-error">{dashboardError}</p>
          <button type="button" onClick={loadDashboard} disabled={isLoading} className="w-fit rounded-full border border-error/30 bg-white px-4 py-2 font-sans text-xs font-extrabold text-error disabled:opacity-50">
            {isLoading ? 'Retrying...' : 'Retry'}
          </button>
        </div>
      )}

      <OwnerMetricSection title="Financial overview" cards={businessPerformanceCards} />

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
        <OwnerSalesPerformance
          trend={monthlySummary?.trend ?? []}
          state={monthSalesState}
          currency={region.currency}
          locale={region.locale}
          onViewSales={canViewSalesRecords && onNavigate ? () => onNavigate('businessSales') : undefined}
        />
        <div className="grid min-w-0 items-start gap-4 md:grid-cols-2 lg:grid-cols-1">
          <OwnerMetricSection title="Daily Operations" cards={dailyOperationCards} layout="rows" />
          <TodaysTasks workspaceId={activeWorkspaceId} userId={userId} inline />
        </div>
      </div>

      <section className="grid items-start gap-4 md:grid-cols-2">
        <OwnerQuickActions actions={quickActions} />
        <OwnerNeedsAttention items={needsAttention} state={alertState} isIncomplete={alertDataIncomplete} />
      </section>

      <section className="grid items-start gap-4 md:grid-cols-2">
        <OwnerRecentActivity items={recentActivity} formatTimestamp={formatShortDate} isIncomplete={activityDataIncomplete} />
        <OwnerBusinessSnapshot items={snapshotItems} />
      </section>
    </div>
  );
}
