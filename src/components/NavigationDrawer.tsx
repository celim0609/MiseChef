/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  Calculator,
  ChevronDown,
  CreditCard,
  Gauge,
  FileBarChart,
  Home,
  PackageSearch,
  LogIn,
  LogOut,
  LockKeyhole,
  MoreHorizontal,
  ReceiptText,
  Settings,
  ShieldCheck,
  Star,
  Truck,
  UsersRound,
  X
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { User } from 'firebase/auth';
import { RecipeCategory, RootTab, SubscriptionPlan, UserRole, WorkspaceMemberRole } from '../types';
import { canAccessRootTab } from '../modules/team/permissions';
import BrandLogo from './BrandLogo';
import { subscriptionService, type PlanFeature } from '../services/subscriptionService';

const PRODUCT_TAB_FEATURES: Partial<Record<RootTab, PlanFeature>> = {
  search: 'recipes',
  favorites: 'recipes',
  business: 'reports',
  businessSales: 'reports',
  businessSuppliers: 'suppliers',
  costing: 'invoiceOcr',
  costingInvoices: 'invoiceOcr',
  costingInvoiceDetail: 'invoiceOcr',
  costingIngredients: 'ingredients',
  costingReports: 'reports'
};

const PRODUCT_TABS = new Set<RootTab>(Object.keys(PRODUCT_TAB_FEATURES) as RootTab[]);

interface NavigationDrawerProps {
  isOpen: boolean;
  categories: RecipeCategory[];
  activeTab: RootTab;
  selectedCategory: string | null;
  isFavoritesFilterActive: boolean;
  categoryCounts: Record<string, number>;
  onClose: () => void;
  onNavigate: (tab: RootTab) => void;
  onSelectCategory: (categoryName: string | null) => void;
  onSelectFavorites: () => void;
  currentUser: User | null;
  currentUserRole?: UserRole;
  workspaceRole?: WorkspaceMemberRole | null;
  workspaceId?: string;
  customAvatarUrl?: string;
  onRenameCategory: (categoryId: string, nextName: string) => void;
  onDeleteCategory: (categoryId: string, targetCategoryName: string) => void;
  onSignOut: () => void;
}

export default function NavigationDrawer({
  isOpen,
  categories,
  activeTab,
  selectedCategory,
  isFavoritesFilterActive,
  categoryCounts,
  onClose,
  onNavigate,
  onSelectCategory,
  onSelectFavorites,
  currentUser,
  currentUserRole = 'user',
  workspaceRole = null,
  workspaceId = '',
  customAvatarUrl = '',
  onRenameCategory,
  onDeleteCategory,
  onSignOut
}: NavigationDrawerProps) {
  const [recipesOpen, setRecipesOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [businessOpen, setBusinessOpen] = useState(false);
  const [costingOpen, setCostingOpen] = useState(false);
  const [openCategoryMenuId, setOpenCategoryMenuId] = useState<string | null>(null);
  const [renamingCategory, setRenamingCategory] = useState<RecipeCategory | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deletingCategory, setDeletingCategory] = useState<RecipeCategory | null>(null);
  const [deleteMode, setDeleteMode] = useState<'remove' | 'replace'>('remove');
  const [replacementCategory, setReplacementCategory] = useState('');
  const [subscriptionPlan, setSubscriptionPlan] = useState<SubscriptionPlan>('free');

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);


  useEffect(() => {
    let isCancelled = false;

    const loadSubscriptionPlan = async () => {
      if (!workspaceId) {
        setSubscriptionPlan('free');
        return;
      }

      try {
        const subscription = await subscriptionService.getCompanySubscription(workspaceId);
        if (!isCancelled) setSubscriptionPlan(subscription.subscriptionPlan);
      } catch (err) {
        if (!isCancelled) setSubscriptionPlan('free');
      }
    };

    loadSubscriptionPlan();

    return () => {
      isCancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === 'search' || activeTab === 'favorites') setRecipesOpen(true);
    if (activeTab === 'business' || activeTab === 'businessSales') setBusinessOpen(true);
    if (activeTab === 'costing' || activeTab === 'costingIngredients' || activeTab === 'costingInvoices' || activeTab === 'costingInvoiceDetail' || activeTab === 'costingReports' || activeTab === 'businessSuppliers') setCostingOpen(true);
  }, [activeTab, isOpen]);

  const handleNavigate = (tab: RootTab) => {
    onNavigate(tab);
    onClose();
  };

  const handleHomeSelect = () => {
    onSelectCategory(null);
    onNavigate('home');
    setOpenCategoryMenuId(null);
    onClose();
  };

  const handleCategorySelect = (categoryName: string | null) => {
    onSelectCategory(categoryName);
    onNavigate('search');
    setOpenCategoryMenuId(null);
    onClose();
  };

  const handleFavoritesSelect = () => {
    onSelectFavorites();
    onNavigate('favorites');
    onClose();
  };

  const isSuperAdmin = currentUserRole === 'super_admin';
  const activePlan = useMemo(() => subscriptionService.getPlanDefinition(subscriptionPlan), [subscriptionPlan]);
  const canUsePlanFeature = (feature: PlanFeature) => subscriptionService.canPlanUseFeature(subscriptionPlan, feature);
  const canUseTabFeature = (tab: RootTab) => {
    const feature = PRODUCT_TAB_FEATURES[tab];
    return feature ? canUsePlanFeature(feature) : true;
  };
  const canAccessByRole = (tab: RootTab) => canAccessRootTab(tab, workspaceRole, isSuperAdmin);
  const canAccess = (tab: RootTab) => {
    if (!canUseTabFeature(tab)) return false;
    return PRODUCT_TABS.has(tab) || canAccessByRole(tab);
  };
  const canAccessRecipes = canUsePlanFeature('recipes');
  const getLockedAccessLabel = (feature: PlanFeature) => {
    if (!workspaceId) return 'Select a workspace';

    const requiredPlan = subscriptionService.getRequiredPlanForFeature(feature);
    if (requiredPlan === activePlan.id) return `Included in ${activePlan.name}`;

    const requiredPlanDefinition = subscriptionService.getPlanDefinition(requiredPlan);
    return activePlan.id === 'free'
      ? `Upgrade to ${requiredPlanDefinition.name}`
      : `Available in ${requiredPlanDefinition.name}`;
  };
  const staticMenuItems: Array<{ label: string; icon: React.ReactNode; tab?: RootTab }> = [
    { label: 'Team', icon: <UsersRound className="w-5 h-5" />, tab: 'team' as RootTab },
    { label: 'Portfolio', icon: <BriefcaseBusiness className="w-5 h-5" />, tab: 'portfolio' as RootTab },
    { label: 'Settings', icon: <Settings className="w-5 h-5" />, tab: 'settings' as RootTab },
    { label: 'Subscription', icon: <CreditCard className="w-5 h-5" />, tab: 'billing' as RootTab }
  ].filter(item => !item.tab || canAccess(item.tab));
  const costingMenuItems: Array<{ label: string; icon: React.ReactNode; tab: RootTab }> = [
    { label: 'Dashboard', icon: <Gauge className="w-4 h-4" />, tab: 'costing' as RootTab },
    { label: 'Ingredients', icon: <PackageSearch className="w-4 h-4" />, tab: 'costingIngredients' as RootTab },
    { label: 'Suppliers', icon: <Truck className="w-4 h-4" />, tab: 'businessSuppliers' as RootTab },
    { label: 'Invoices', icon: <ReceiptText className="w-4 h-4" />, tab: 'costingInvoices' as RootTab },
    { label: 'Reports', icon: <FileBarChart className="w-4 h-4" />, tab: 'costingReports' as RootTab }
  ].filter(item => canUseTabFeature(item.tab));
  const businessMenuItems: Array<{ label: string; icon: React.ReactNode; tab: RootTab }> = [
    { label: 'Dashboard', icon: <BarChart3 className="w-4 h-4" />, tab: 'business' as RootTab },
    { label: 'Sales', icon: <CreditCard className="w-4 h-4" />, tab: 'businessSales' as RootTab }
  ].filter(item => canUseTabFeature(item.tab));

  const displayName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'MiseChef User';
  const displayEmail = currentUser?.email || 'Sign in to access your workspace';
  const avatarUrl = customAvatarUrl || currentUser?.photoURL || '';
  const avatarInitial = displayName.trim().charAt(0).toUpperCase() || 'M';

  const handleAccountSignOut = () => {
    onSignOut();
    onClose();
  };


  const LockedNavItem = ({ label, icon, feature }: { label: string; icon: React.ReactNode; feature: PlanFeature }) => (
    <div className="w-full rounded-2xl border border-surface-container-high/70 bg-surface-container-low/70 px-4 py-3 text-left" aria-disabled="true">
      <div className="flex items-center gap-3 font-sans text-sm font-extrabold text-on-surface-variant">
        {icon}
        <span className="flex-1">{label}</span>
        <LockKeyhole className="h-4 w-4 text-outline" />
      </div>
      <p className="mt-1 pl-8 font-sans text-[10px] font-extrabold uppercase tracking-[0.12em] text-outline">{getLockedAccessLabel(feature)}</p>
    </div>
  );

  const startRenameCategory = (category: RecipeCategory) => {
    setRenamingCategory(category);
    setRenameValue(category.name);
    setOpenCategoryMenuId(null);
  };

  const submitRenameCategory = () => {
    if (!renamingCategory) return;
    onRenameCategory(renamingCategory.id, renameValue);
    setRenamingCategory(null);
    setRenameValue('');
  };

  const startDeleteCategory = (category: RecipeCategory) => {
    const firstReplacement = categories.find(item => item.id !== category.id)?.name || '';
    setDeletingCategory(category);
    setDeleteMode(firstReplacement ? 'replace' : 'remove');
    setReplacementCategory(firstReplacement);
    setOpenCategoryMenuId(null);
  };

  const confirmDeleteCategory = () => {
    if (!deletingCategory) return;
    onDeleteCategory(
      deletingCategory.id,
      deleteMode === 'replace' ? replacementCategory : ''
    );
    setDeletingCategory(null);
    setDeleteMode('remove');
    setReplacementCategory('');
  };

  const replacementOptions = deletingCategory
    ? categories.filter(category => category.id !== deletingCategory.id)
    : [];
  const deletingCategoryCount = deletingCategory ? categoryCounts[deletingCategory.name] || 0 : 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[70]">
          <motion.button
            type="button"
            aria-label="Close navigation menu"
            className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={onClose}
          />

          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 360, damping: 34 }}
            className="absolute left-0 top-0 h-full w-[84vw] max-w-sm bg-background border-r border-surface-container-high shadow-2xl flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
          >
            <div className="px-5 pt-5 pb-4 border-b border-surface-container-high flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <BrandLogo className="h-8 w-auto shrink-0" />
                <div className="min-w-0">
                  <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">
                    Menu
                  </p>
                  <h2 className="font-display italic text-2xl text-primary font-semibold">
                    MiseChef
                  </h2>
                  <p className="font-sans text-xs text-on-surface-variant font-bold">
                    Everything in its place.
                  </p>
                  <p className="font-sans text-[8px] text-outline font-extrabold uppercase tracking-[0.18em]">
                    by Ce Lim
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-full text-primary hover:bg-surface-container active:scale-95 transition-all"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
              <button
                type="button"
                onClick={handleHomeSelect}
                className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left font-sans font-extrabold text-sm transition-all ${
                  activeTab === 'home'
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'text-primary hover:bg-surface-container'
                }`}
              >
                <Home className="w-5 h-5" />
                <span>Home</span>
              </button>

              {!canAccessRecipes && currentUser && (
                <LockedNavItem label="Recipes" icon={<BookOpen className="w-5 h-5" />} feature="recipes" />
              )}

              {canAccessRecipes && (
                <>
                  <button
                    type="button"
                    onClick={() => setRecipesOpen(prev => !prev)}
                    className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left font-sans font-extrabold text-sm transition-all ${
                      activeTab === 'search' || activeTab === 'favorites'
                        ? 'bg-primary/10 text-primary'
                        : 'text-primary hover:bg-surface-container'
                    }`}
                    aria-expanded={recipesOpen}
                  >
                    <BookOpen className="w-5 h-5" />
                    <span className="flex-1">Recipes</span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${recipesOpen ? 'rotate-180' : ''}`} />
                  </button>

                  <AnimatePresence initial={false}>
                    {recipesOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        className="ml-8 mr-2 mb-2 space-y-1 overflow-hidden border-l border-surface-container-high pl-3"
                      >
                        <button
                          type="button"
                          onClick={() => handleCategorySelect(null)}
                          className={`w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-left font-sans text-xs font-bold transition-all ${
                            activeTab === 'search' && !selectedCategory
                              ? 'bg-primary text-on-primary shadow-sm'
                              : 'text-on-surface-variant hover:bg-surface-container hover:text-primary'
                          }`}
                        >
                          <BookOpen className="w-4 h-4" />
                          <span>All Recipes</span>
                        </button>

                  <div className="rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setCategoriesOpen(prev => !prev)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 text-left font-sans font-extrabold text-sm transition-all ${
                    activeTab === 'search' && selectedCategory
                      ? 'bg-primary/10 text-primary'
                      : 'text-primary hover:bg-surface-container'
                  }`}
                  aria-expanded={categoriesOpen}
                >
                  <BookOpen className="w-4 h-4" />
                  <span className="flex-1">Categories</span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${categoriesOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                <AnimatePresence initial={false}>
                  {categoriesOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      className="overflow-hidden"
                    >
                      <div className="ml-4 mr-1 mb-2 space-y-1 border-l border-surface-container-high pl-3">
                        {categories.length > 0 ? (
                          categories.map(category => {
                            const isSelected = selectedCategory === category.name && activeTab === 'search';
                            return (
                              <div key={category.id} className="relative space-y-1">
                                <div
                                  className={`flex items-center rounded-xl transition-all ${
                                    isSelected
                                      ? 'bg-primary text-on-primary shadow-sm'
                                      : 'text-on-surface-variant hover:bg-surface-container hover:text-primary'
                                  }`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => handleCategorySelect(category.name)}
                                    className="min-w-0 flex-1 rounded-xl px-3 py-2.5 text-left font-sans text-xs font-bold transition-all"
                                  >
                                    <span className="block truncate">
                                      {category.name} ({categoryCounts[category.name] || 0})
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setOpenCategoryMenuId(prev => prev === category.id ? null : category.id);
                                    }}
                                    className={`mr-1 rounded-full p-1.5 transition-all ${
                                      isSelected
                                        ? 'text-on-primary hover:bg-white/15'
                                        : 'text-outline hover:bg-surface-container-high hover:text-primary'
                                    }`}
                                    aria-label={`Manage ${category.name}`}
                                  >
                                    <MoreHorizontal className="w-4 h-4" />
                                  </button>
                                </div>

                                <AnimatePresence>
                                  {openCategoryMenuId === category.id && (
                                    <motion.div
                                      initial={{ opacity: 0, y: -4 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      exit={{ opacity: 0, y: -4 }}
                                      transition={{ duration: 0.15, ease: 'easeOut' }}
                                      className="ml-3 rounded-2xl border border-surface-container-high bg-background p-1.5 shadow-lg shadow-primary/10"
                                    >
                                      <button
                                        type="button"
                                        onClick={() => startRenameCategory(category)}
                                        className="w-full rounded-xl px-3 py-2 text-left font-sans text-xs font-bold text-primary hover:bg-surface-container transition-all"
                                      >
                                        Rename
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => startDeleteCategory(category)}
                                        className="w-full rounded-xl px-3 py-2 text-left font-sans text-xs font-bold text-red-600 hover:bg-red-50 transition-all"
                                      >
                                        Delete
                                      </button>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            );
                          })
                        ) : (
                          <p className="px-3 py-2.5 font-sans text-xs font-bold text-outline">
                            No categories yet
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
                <button
                  type="button"
                  onClick={handleFavoritesSelect}
                className={`w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-left font-sans text-xs font-bold transition-all ${
                  (isFavoritesFilterActive && activeTab === 'home') || activeTab === 'favorites'
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-primary'
                }`}
              >
                <Star className="w-4 h-4" />
                <span>Favorites</span>
                </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}

              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={() => handleNavigate('admin')}
                  className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left font-sans font-extrabold text-sm hover:bg-surface-container active:scale-[0.99] transition-all ${
                    activeTab === 'admin'
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'text-primary'
                  }`}
                >
                  <ShieldCheck className="w-5 h-5" />
                  <span>Admin</span>
                </button>
              )}

              {businessMenuItems.length === 0 && currentUser && (
                <LockedNavItem label="Business" icon={<CreditCard className="w-5 h-5" />} feature="reports" />
              )}

              {businessMenuItems.length > 0 && (
                <div className="rounded-2xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setBusinessOpen(prev => !prev)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 text-left font-sans font-extrabold text-sm transition-all ${
                    activeTab === 'business' || activeTab === 'businessSales'
                      ? 'bg-primary/10 text-primary'
                      : 'text-primary hover:bg-surface-container'
                  }`}
                  aria-expanded={businessOpen}
                >
                  <CreditCard className="w-5 h-5" />
                  <span className="flex-1">Business</span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${businessOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                <AnimatePresence initial={false}>
                  {businessOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      className="overflow-hidden"
                    >
                      <div className="ml-8 mr-2 mb-2 space-y-1 border-l border-surface-container-high pl-3">
                        {businessMenuItems.map(item => (
                          <button
                            type="button"
                            key={item.label}
                            onClick={() => handleNavigate(item.tab)}
                            className={`w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-left font-sans text-xs font-bold transition-all ${
                              activeTab === item.tab
                                ? 'bg-primary text-on-primary shadow-sm'
                                : 'text-on-surface-variant hover:bg-surface-container hover:text-primary'
                            }`}
                          >
                            {item.icon}
                            <span>{item.label}</span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                </div>
              )}

              {costingMenuItems.length === 0 && currentUser && (
                <LockedNavItem label="Costing" icon={<Calculator className="w-5 h-5" />} feature="invoiceOcr" />
              )}

              {costingMenuItems.length > 0 && (
                <div className="rounded-2xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setCostingOpen(prev => !prev)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 text-left font-sans font-extrabold text-sm transition-all ${
                    activeTab === 'costing' || activeTab === 'costingIngredients' || activeTab === 'costingInvoices' || activeTab === 'costingInvoiceDetail' || activeTab === 'costingReports' || activeTab === 'businessSuppliers'
                      ? 'bg-primary/10 text-primary'
                      : 'text-primary hover:bg-surface-container'
                  }`}
                  aria-expanded={costingOpen}
                >
                  <Calculator className="w-5 h-5" />
                  <span className="flex-1">Costing</span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${costingOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                <AnimatePresence initial={false}>
                  {costingOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      className="overflow-hidden"
                    >
                      <div className="ml-8 mr-2 mb-2 space-y-1 border-l border-surface-container-high pl-3">
                        {costingMenuItems.map(item => (
                          <button
                            type="button"
                            key={item.label}
                            onClick={() => handleNavigate(item.tab)}
                            className={`w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-left font-sans text-xs font-bold transition-all ${
                              activeTab === item.tab
                                ? 'bg-primary text-on-primary shadow-sm'
                                : 'text-on-surface-variant hover:bg-surface-container hover:text-primary'
                            }`}
                          >
                            {item.icon}
                            <span>{item.label}</span>
                          </button>
                        ))}
                        <button
                          type="button"
                          disabled
                          className="w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-left font-sans text-xs font-bold text-outline cursor-not-allowed"
                        >
                          <ReceiptText className="w-4 h-4" />
                          <span>Quotation (Reserved)</span>
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                </div>
              )}

              {staticMenuItems.map(item => (
                <button
                  type="button"
                  key={item.label}
                  onClick={() => (item.tab ? handleNavigate(item.tab) : onClose())}
                  className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left font-sans font-extrabold text-sm hover:bg-surface-container active:scale-[0.99] transition-all ${
                    item.tab && activeTab === item.tab
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'text-primary'
                  }`}
                >
                  <span className="leading-none">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}

            </nav>

            <div className="border-t border-surface-container-high p-3 space-y-2">
              <div className="flex items-center gap-3 rounded-2xl bg-surface-container-low px-4 py-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center overflow-hidden shrink-0">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={displayName}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="font-display text-xl font-semibold">{avatarInitial}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-sans text-sm font-extrabold text-primary truncate">
                    {displayName}
                  </p>
                  <p className="font-sans text-[11px] font-bold text-on-surface-variant truncate">
                    {displayEmail}
                  </p>
                </div>
              </div>

              {currentUser ? (
                <div className="grid grid-cols-1 gap-1">
                  <button
                    type="button"
                    onClick={handleAccountSignOut}
                    className="w-full flex items-center gap-2 rounded-xl px-4 py-2.5 text-left font-sans text-xs font-bold text-secondary hover:bg-secondary/10 transition-all"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Log Out</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleNavigate('login')}
                  className="w-full flex items-center gap-2 rounded-xl px-4 py-3 text-left font-sans text-xs font-bold text-primary hover:bg-surface-container transition-all"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Sign In</span>
                </button>
              )}
            </div>

            <AnimatePresence>
              {renamingCategory && (
                <motion.div
                  className="fixed inset-0 z-[90] bg-black/45 backdrop-blur-sm flex items-center justify-center p-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setRenamingCategory(null)}
                >
                  <motion.div
                    initial={{ scale: 0.96, y: 8 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.96, y: 8 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="w-full max-w-sm rounded-2xl border border-surface-container-high bg-background p-5 shadow-2xl space-y-4"
                    onClick={event => event.stopPropagation()}
                  >
                    <div>
                      <h3 className="font-display text-xl font-semibold text-primary">Rename category</h3>
                      <p className="font-sans text-xs font-bold text-on-surface-variant">
                        Recipes using this category will update automatically.
                      </p>
                    </div>
                    <input
                      type="text"
                      value={renameValue}
                      onChange={event => setRenameValue(event.target.value)}
                      onKeyDown={event => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          submitRenameCategory();
                        }
                        if (event.key === 'Escape') {
                          setRenamingCategory(null);
                        }
                      }}
                      autoFocus
                      className="w-full rounded-xl border border-surface-container-high bg-surface-container px-4 py-3 font-sans text-sm font-bold text-on-surface focus:ring-1 focus:ring-primary"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setRenamingCategory(null)}
                        className="flex-1 rounded-full bg-surface-container px-4 py-2.5 font-sans text-xs font-bold text-primary active:scale-95 transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={submitRenameCategory}
                        className="flex-1 rounded-full bg-primary px-4 py-2.5 font-sans text-xs font-bold text-on-primary active:scale-95 transition-all"
                      >
                        Save
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {deletingCategory && (
                <motion.div
                  className="fixed inset-0 z-[90] bg-black/45 backdrop-blur-sm flex items-center justify-center p-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setDeletingCategory(null)}
                >
                  <motion.div
                    initial={{ scale: 0.96, y: 8 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.96, y: 8 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="w-full max-w-sm rounded-2xl border border-surface-container-high bg-background p-5 shadow-2xl space-y-4"
                    onClick={event => event.stopPropagation()}
                  >
                    <div>
                      <h3 className="font-display text-xl font-semibold text-primary">
                        Delete "{deletingCategory.name}"?
                      </h3>
                      <p className="font-sans text-xs font-bold text-on-surface-variant">
                        {deletingCategoryCount} recipes currently use this category.
                      </p>
                    </div>

                    {deletingCategoryCount > 0 && (
                      <div className="space-y-3">
                        <label className="flex items-start gap-3 rounded-2xl border border-surface-container-high bg-surface-container-low p-3 cursor-pointer">
                          <input
                            type="radio"
                            checked={deleteMode === 'remove'}
                            onChange={() => setDeleteMode('remove')}
                            className="mt-0.5 accent-primary"
                          />
                          <span>
                            <span className="block font-sans text-xs font-extrabold text-primary">
                              Remove from all recipes
                            </span>
                            <span className="block font-sans text-[11px] font-bold text-on-surface-variant">
                              Recipes stay saved, just without this category.
                            </span>
                          </span>
                        </label>

                        <label className="flex items-start gap-3 rounded-2xl border border-surface-container-high bg-surface-container-low p-3 cursor-pointer">
                          <input
                            type="radio"
                            checked={deleteMode === 'replace'}
                            onChange={() => setDeleteMode('replace')}
                            disabled={replacementOptions.length === 0}
                            className="mt-0.5 accent-primary disabled:opacity-40"
                          />
                          <span className="min-w-0 flex-1 space-y-2">
                            <span className="block font-sans text-xs font-extrabold text-primary">
                              Replace with another category
                            </span>
                            <select
                              value={replacementCategory}
                              onChange={event => {
                                setReplacementCategory(event.target.value);
                                setDeleteMode('replace');
                              }}
                              disabled={replacementOptions.length === 0}
                              className="w-full rounded-xl border border-surface-container-high bg-surface-container px-3 py-2 font-sans text-xs font-bold text-on-surface disabled:opacity-50"
                            >
                              {replacementOptions.length === 0 ? (
                                <option value="">No other categories</option>
                              ) : (
                                replacementOptions.map(category => (
                                  <option key={category.id} value={category.name}>
                                    {category.name}
                                  </option>
                                ))
                              )}
                            </select>
                          </span>
                        </label>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setDeletingCategory(null)}
                        className="flex-1 rounded-full bg-surface-container px-4 py-2.5 font-sans text-xs font-bold text-primary active:scale-95 transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={confirmDeleteCategory}
                        disabled={deleteMode === 'replace' && !replacementCategory}
                        className="flex-1 rounded-full bg-red-600 px-4 py-2.5 font-sans text-xs font-bold text-white active:scale-95 transition-all disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
