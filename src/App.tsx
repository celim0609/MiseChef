/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Search, Plus, Home } from 'lucide-react';
import { getRedirectResult, onAuthStateChanged, signOut, type Unsubscribe, type User } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { ChefProfile, CompanyRole, DEFAULT_CHEF_PROFILE, Recipe, RecipeCategory, RootTab, UserRole, Workspace, WorkspaceMemberRole } from './types';
import { INITIAL_COLLECTIONS, INITIAL_RECIPES } from './data';
import Header from './components/Header';
import HomeTab from './components/HomeTab';
import SearchTab from './components/SearchTab';
import AddRecipeTab from './components/AddRecipeTab';
import RecipeDetailModal from './components/RecipeDetailModal';
import NavigationDrawer from './components/NavigationDrawer';
import SettingsTab, { ImportedAppData } from './components/SettingsTab';
import LoginTab from './components/LoginTab';
import FavoritesTab from './components/FavoritesTab';
import StatisticsTab from './components/StatisticsTab';
import { AdminPage } from './modules/admin';
import { PortfolioPage } from './modules/portfolio';
import { CostingPage } from './modules/costing';
import { recipeCostService } from './modules/costing/services';
import { BusinessPage } from './modules/business';
import { TeamPage } from './modules/team';
import { SubscriptionCenterPage } from './modules/subscription';
import { teamService } from './modules/team/services';
import type { TeamInvitation } from './modules/team/types';
import { MarketingPage } from './modules/marketing';
import { isPublicExperiencePath, PublicLayout } from './modules/public';
import { AnimatePresence, motion } from 'motion/react';
import BrandLogo from './components/BrandLogo';
import { auth, authPersistenceReady, db } from './firebase';
import { deleteRecipeCoverImage, deleteRecipeScanAttachment, isLocalImageDataUrl, uploadRecipeCoverImage, uploadRecipeScanAttachment, uploadRecipeStepImage } from './services/storage';
import { FALLBACK_CATEGORY_NAME, getRecipeCategories, normalizeRecipeCategories, recipeHasCategory } from './utils/categoryUtils';
import { normalizeIngredientForDisplay } from './utils/ingredientParser';
import { getConfiguredRoleForUser, resolveUserRole } from './utils/userRoles';
import { workspaceService } from './services/workspaceService';
import { usageLimitService } from './services/usageLimitService';
import { canAccessRootTab, normalizeTeamRole } from './modules/team/permissions';

const STORAGE_RECIPES_KEY = 'my_cookbook_recipes_v2';
const STORAGE_CATEGORIES_KEY = 'ce_lims_kitchen_categories_v1';
const STORAGE_APPEARANCE_KEY = 'ce_lims_kitchen_appearance_v1';
const STORAGE_PROFILE_KEY = 'ce_lims_kitchen_chef_profile_v1';
const DEFAULT_COVER_IMAGE = 'https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&q=80&w=800';

const MARKETING_PATHS = new Set(['/', '/features', '/pricing', '/book-demo', '/contact']);
const MARKETING_SECTION_BY_PATH: Record<string, string> = {
  '/': 'home',
  '/features': 'features',
  '/pricing': 'pricing',
  '/book-demo': 'book-demo',
  '/contact': 'contact'
};
const isMarketingPath = (pathname: string) => MARKETING_PATHS.has(pathname);

const APP_ROOT_PATH = '/app';
const isAppPath = (pathname: string) => pathname === APP_ROOT_PATH || pathname.startsWith(`${APP_ROOT_PATH}/`);

const SUBSCRIPTION_GATED_PRODUCT_TABS = new Set<RootTab>([
  'search',
  'favorites',
  'business',
  'businessSales',
  'businessSuppliers',
  'costing',
  'costingIngredients',
  'costingInvoices',
  'costingInvoiceDetail',
  'costingReports'
]);

const ROOT_TAB_PATHS: Record<RootTab, string> = {
  home: '/app',
  search: '/app/recipes',
  favorites: '/app/favorites',
  portfolio: '/app/portfolio',
  profile: '/app/profile',
  statistics: '/app/statistics',
  settings: '/app/settings',
  billing: '/app/billing',
  login: '/login',
  team: '/app/team',
  admin: '/app/admin',
  business: '/app/business',
  businessSales: '/app/business/sales',
  businessSuppliers: '/app/business/suppliers',
  costing: '/app/costing',
  costingIngredients: '/app/costing/ingredients',
  costingInvoices: '/app/costing/invoices',
  costingInvoiceDetail: '/app/costing/invoices',
  costingReports: '/app/costing/reports'
};

const getCostingInvoiceIdFromPath = (pathname: string) => {
  const match = pathname.match(/^\/app\/costing\/invoices\/([^/]+)$/) ?? pathname.match(/^\/costing\/invoices\/([^/]+)$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
};

const getRootTabFromPath = (pathname: string): RootTab => {
  if (getCostingInvoiceIdFromPath(pathname)) return 'costingInvoiceDetail';

  switch (pathname) {
    case '/app':
    case '/app/':
      return 'home';
    case '/app/recipes':
    case '/search':
      return 'search';
    case '/app/favorites':
    case '/favorites':
      return 'favorites';
    case '/app/portfolio':
    case '/portfolio':
      return 'portfolio';
    case '/app/profile':
    case '/profile':
      return 'profile';
    case '/app/statistics':
    case '/statistics':
      return 'statistics';
    case '/app/settings':
    case '/settings':
      return 'settings';
    case '/app/billing':
    case '/billing':
      return 'billing';
    case '/login':
      return 'login';
    case '/app/team':
    case '/team':
      return 'team';
    case '/app/admin':
    case '/admin':
      return 'admin';
    case '/app/business':
    case '/business':
      return 'business';
    case '/app/business/sales':
    case '/business/sales':
      return 'businessSales';
    case '/app/business/suppliers':
    case '/business/suppliers':
      return 'businessSuppliers';
    case '/app/costing':
    case '/costing':
      return 'costing';
    case '/app/costing/ingredients':
    case '/costing/ingredients':
      return 'costingIngredients';
    case '/app/costing/invoices':
    case '/costing/invoices':
      return 'costingInvoices';
    case '/app/costing/reports':
    case '/costing/reports':
      return 'costingReports';
    default:
      return 'home';
  }
};

function BrandLoadingScreen() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="flex flex-col items-center gap-4 text-center"
      >
        <BrandLogo className="h-8 w-auto" />
        <div className="space-y-1">
          <h1 className="font-display italic text-4xl text-primary font-semibold">
            MiseChef
          </h1>
          <p className="font-sans text-xs text-secondary font-bold tracking-wide">
            Everything in its place.
          </p>
          <p className="font-sans text-[9px] text-outline font-extrabold uppercase tracking-[0.22em]">
            by Ce Lim
          </p>
        </div>
      </motion.div>
    </div>
  );
}

const createCategoryRecord = (name: string): RecipeCategory => ({
  id: `cat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  name: name.trim(),
  createdAt: new Date().toISOString()
});

const buildInitialCategories = (recipeList: Recipe[]) => {
  const names = new Set<string>();
  recipeList.forEach(recipe => {
    const categories = Array.isArray(recipe.categories) && recipe.categories.length > 0
      ? recipe.categories
      : [recipe.category];
    normalizeRecipeCategories(categories).forEach(category => {
      if (category !== FALLBACK_CATEGORY_NAME) {
        names.add(category);
      }
    });
  });

  return Array.from(names).map(name => createCategoryRecord(name));
};

const sanitizeCategoryList = (categoryList: RecipeCategory[]) => {
  const seen = new Set<string>();

  return categoryList
    .map(category => ({ ...category, name: category.name.trim() }))
    .filter(category => category.name && category.name !== FALLBACK_CATEGORY_NAME)
    .filter(category => {
      const key = category.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const loadLocalRecipes = () => {
  const cachedRecipes = localStorage.getItem(STORAGE_RECIPES_KEY);

  if (!cachedRecipes) return INITIAL_RECIPES.map(normalizeLoadedRecipe);

  try {
    const parsedRecipes = JSON.parse(cachedRecipes);
    return Array.isArray(parsedRecipes)
      ? (parsedRecipes as Recipe[]).map(normalizeLoadedRecipe)
      : INITIAL_RECIPES.map(normalizeLoadedRecipe);
  } catch (err) {
    return INITIAL_RECIPES.map(normalizeLoadedRecipe);
  }
};

const normalizeChefProfile = (profile?: Partial<ChefProfile> | null): ChefProfile => ({
  ...DEFAULT_CHEF_PROFILE,
  ...(profile || {}),
  photo: typeof profile?.photo === 'string' ? profile.photo : DEFAULT_CHEF_PROFILE.photo,
  name: typeof profile?.name === 'string' ? profile.name : DEFAULT_CHEF_PROFILE.name,
  jobTitle: typeof profile?.jobTitle === 'string' ? profile.jobTitle : DEFAULT_CHEF_PROFILE.jobTitle,
  yearsExperience: typeof profile?.yearsExperience === 'string' ? profile.yearsExperience : DEFAULT_CHEF_PROFILE.yearsExperience,
  bio: typeof profile?.bio === 'string' ? profile.bio : DEFAULT_CHEF_PROFILE.bio,
  quote: typeof profile?.quote === 'string' ? profile.quote : DEFAULT_CHEF_PROFILE.quote
});

const loadLocalProfile = () => {
  const cachedProfile = localStorage.getItem(STORAGE_PROFILE_KEY);
  if (!cachedProfile) return DEFAULT_CHEF_PROFILE;

  try {
    const parsedProfile = JSON.parse(cachedProfile);
    return normalizeChefProfile(parsedProfile);
  } catch (err) {
    return DEFAULT_CHEF_PROFILE;
  }
};

const removeUndefinedFields = <T,>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map(item => removeUndefinedFields(item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, item]) => {
      if (item !== undefined) {
        acc[key] = removeUndefinedFields(item);
      }
      return acc;
    }, {}) as T;
  }

  return value;
};

const getFirestoreRecipePayload = (recipe: Recipe, user: User) => {
  const imageUrl = recipe.imageUrl || recipe.coverImage || DEFAULT_COVER_IMAGE;
  const { scannedImageDataUrl, ...recipeForFirestore } = recipe;
  const categories = normalizeRecipeCategories(
    Array.isArray(recipe.categories) ? recipe.categories : [recipe.category]
  );

  return removeUndefinedFields({
    ...recipeForFirestore,
    category: categories[0] || '',
    categories,
    visibility: recipe.visibility || 'private',
    coverImage: imageUrl,
    imageUrl,
    userId: user.uid,
    updatedAt: new Date().toISOString()
  });
};

const normalizeLoadedRecipe = (recipe: Recipe) => {
  const categories = getRecipeCategories(recipe);
  const imageUrl = recipe.imageUrl || recipe.coverImage || DEFAULT_COVER_IMAGE;

  return {
    ...recipe,
    category: categories[0] === FALLBACK_CATEGORY_NAME ? '' : categories[0],
    categories: categories[0] === FALLBACK_CATEGORY_NAME ? [] : categories,
    visibility: recipe.visibility || 'private',
    ingredients: Array.isArray(recipe.ingredients)
      ? recipe.ingredients.map(normalizeIngredientForDisplay)
      : [],
    coverImage: imageUrl,
    imageUrl
  } as Recipe;
};

const getDefaultCompanyId = (user: User) => user.uid;

const getDefaultCompanyName = (user: User) => {
  const displayName = user.displayName?.trim();
  if (displayName) return `${displayName}'s Company`;

  const emailName = user.email?.split('@')[0]?.trim();
  return emailName ? `${emailName}'s Company` : 'My Company';
};

const resolveCompanyRole = (platformRole: UserRole, storedCompanyRole?: unknown): CompanyRole => {
  if (platformRole === 'super_admin') return 'super_admin';
  if (storedCompanyRole === 'manager') return 'manager';
  if (storedCompanyRole === 'chef') return 'chef';
  if (storedCompanyRole === 'staff') return 'staff';
  return 'owner';
};

const ensureDefaultCompany = async ({
  user,
  companyId
}: {
  user: User;
  companyId: string;
}) => {
  if (!db) return;

  const companyRef = doc(db, 'companies', companyId);
  const companySnapshot = await getDoc(companyRef);
  const now = new Date().toISOString();

  await setDoc(companyRef, removeUndefinedFields({
    companyId,
    name: companySnapshot.exists() ? companySnapshot.data()?.name : getDefaultCompanyName(user),
    ownerId: user.uid,
    subscriptionPlan: companySnapshot.exists() ? companySnapshot.data()?.subscriptionPlan : 'free',
    subscriptionStatus: companySnapshot.exists() ? companySnapshot.data()?.subscriptionStatus : 'active',
    billingCycle: companySnapshot.exists() ? companySnapshot.data()?.billingCycle : 'monthly',
    subscriptionStartedAt: companySnapshot.exists() ? companySnapshot.data()?.subscriptionStartedAt : now,
    subscriptionRenewalAt: companySnapshot.exists() ? companySnapshot.data()?.subscriptionRenewalAt : '',
    subscriptionCancelledAt: companySnapshot.exists() ? companySnapshot.data()?.subscriptionCancelledAt || null : null,
    status: companySnapshot.exists() ? companySnapshot.data()?.status : 'Active',
    createdAt: companySnapshot.exists() ? companySnapshot.data()?.createdAt : now,
    updatedAt: now
  }), { merge: true });
};

const createUserDocument = async (user: User): Promise<UserRole> => {
  if (!db) return getConfiguredRoleForUser(user);

  const userRef = doc(db, 'users', user.uid);
  const existingUser = await getDoc(userRef);
  const existingUserData = existingUser.exists() ? existingUser.data() : null;
  const role = resolveUserRole(user, existingUserData?.role);
  const companyId = typeof existingUserData?.companyId === 'string' && existingUserData.companyId.trim()
    ? existingUserData.companyId.trim()
    : getDefaultCompanyId(user);
  const companyRole = resolveCompanyRole(role, existingUserData?.companyRole);
  const existingProfile = existingUser.exists()
    ? normalizeChefProfile(existingUserData?.profile as Partial<ChefProfile> | undefined)
    : normalizeChefProfile({
        name: user.displayName || DEFAULT_CHEF_PROFILE.name,
        photo: user.photoURL || DEFAULT_CHEF_PROFILE.photo
      });

  await ensureDefaultCompany({
    user,
    companyId
  });

  await setDoc(userRef, removeUndefinedFields({
    uid: user.uid,
    companyId,
    companyRole,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    role,
    profile: existingProfile,
    authProvider: user.providerData[0]?.providerId || 'password',
    createdAt: existingUser.exists() ? existingUserData?.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }), { merge: true });

  return role;
};

const loadFirestoreProfile = async (user: User) => {
  if (!db) return null;

  const userSnapshot = await getDoc(doc(db, 'users', user.uid));
  if (!userSnapshot.exists()) return null;

  return normalizeChefProfile(userSnapshot.data().profile as Partial<ChefProfile> | undefined);
};

const loadFirestoreRecipes = async (user: User, workspaceId = user.uid) => {
  if (!db) return [];

  const recipesQuery = workspaceId === user.uid
    ? query(collection(db, 'recipes'), where('userId', '==', user.uid))
    : query(collection(db, 'recipes'), where('workspaceId', '==', workspaceId));
  const snapshot = await getDocs(recipesQuery);

  return snapshot.docs
    .map(recipeDoc => {
      const data = recipeDoc.data() as Recipe & { workspaceId?: string };
      return normalizeLoadedRecipe({
        id: recipeDoc.id,
        ...data
      } as Recipe);
    })
    .filter(recipe => {
      const workspaceValue = (recipe as Recipe & { workspaceId?: string }).workspaceId;
      return workspaceId === user.uid ? !workspaceValue || workspaceValue === workspaceId : workspaceValue === workspaceId;
    })
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
};

const loadFirestoreCategories = async (user: User, workspaceId = user.uid) => {
  if (!db) return [];

  const categoriesQuery = workspaceId === user.uid
    ? query(collection(db, 'categories'), where('userId', '==', user.uid))
    : query(collection(db, 'categories'), where('workspaceId', '==', workspaceId));
  const snapshot = await getDocs(categoriesQuery);
  const loadedCategories = snapshot.docs
    .map(categoryDoc => ({ id: categoryDoc.id, ...categoryDoc.data() } as RecipeCategory & { workspaceId?: string }))
    .filter(category => category.name?.trim())
    .filter(category => workspaceId === user.uid ? !category.workspaceId || category.workspaceId === workspaceId : category.workspaceId === workspaceId)
    .sort((a, b) => a.name.localeCompare(b.name));

  return sanitizeCategoryList(loadedCategories);
};

const saveCategoryToFirestore = async (category: RecipeCategory, user: User, workspaceId = user.uid) => {
  if (!db) return;

  await setDoc(doc(db, 'categories', category.id), removeUndefinedFields({
    ...category,
    name: category.name.trim(),
    userId: user.uid,
    workspaceId,
    companyId: workspaceId,
    updatedAt: new Date().toISOString()
  }), { merge: true });
};

const deleteCategoryFromFirestore = async (categoryId: string) => {
  if (!db) return;

  await deleteDoc(doc(db, 'categories', categoryId));
};

const saveRecipeToFirestore = async (recipe: Recipe, user: User, workspaceId = user.uid) => {
  if (!db) {
    return;
  }

  await setDoc(doc(db, 'recipes', recipe.id), {
    ...getFirestoreRecipePayload(recipe, user),
    workspaceId,
    companyId: workspaceId
  }, { merge: true });
};

const deleteRecipeFromFirestore = async (recipeId: string) => {
  if (!db) {
    return;
  }

  await deleteDoc(doc(db, 'recipes', recipeId));
};

const getCloudReadyRecipe = async (
  recipe: Recipe,
  user: User,
  onUploadProgress?: (progress: number, phase: 'cover' | 'scan' | 'step') => void
) => {
  let nextRecipe = { ...recipe };

  if (isLocalImageDataUrl(recipe.coverImage)) {
    const imageUrl = await uploadRecipeCoverImage({
      userId: user.uid,
      recipeId: recipe.id,
      imageDataUrl: recipe.coverImage,
      onProgress: progress => onUploadProgress?.(progress, 'cover'),
    });

    nextRecipe = {
      ...nextRecipe,
      coverImage: imageUrl,
      imageUrl,
    };
  }

  if (isLocalImageDataUrl(recipe.scannedImageDataUrl)) {
    const scanAttachmentUrl = await uploadRecipeScanAttachment({
      userId: user.uid,
      recipeId: recipe.id,
      imageDataUrl: recipe.scannedImageDataUrl,
      onProgress: progress => onUploadProgress?.(progress, 'scan'),
    });

    nextRecipe = {
      ...nextRecipe,
      scanAttachmentUrl,
    };
  }

  const methodWithUploadedImages = await Promise.all(
    nextRecipe.method.map(async step => {
      if (!isLocalImageDataUrl(step.image)) return step;

      const stepImageUrl = await uploadRecipeStepImage({
        userId: user.uid,
        recipeId: recipe.id,
        stepId: step.id,
        imageDataUrl: step.image,
        onProgress: progress => onUploadProgress?.(progress, 'step'),
      });

      return {
        ...step,
        image: stepImageUrl,
      };
    })
  );

  nextRecipe = {
    ...nextRecipe,
    method: methodWithUploadedImages,
  };

  const imageUrl = nextRecipe.imageUrl || nextRecipe.coverImage || DEFAULT_COVER_IMAGE;
  return {
    ...nextRecipe,
    coverImage: imageUrl,
    imageUrl,
    scannedImageDataUrl: undefined,
  };
};

export default function App() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [collections] = useState(INITIAL_COLLECTIONS);
  const [categories, setCategories] = useState<RecipeCategory[]>([]);
  const [activeTab, setActiveTab] = useState<RootTab>('login');
  const [addingRecipe, setAddingRecipe] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [isNavigationDrawerOpen, setIsNavigationDrawerOpen] = useState(false);
  const [selectedHomeCategory, setSelectedHomeCategory] = useState<string | null>(null);
  const [isFavoritesFilterActive, setIsFavoritesFilterActive] = useState(false);
  const [isAppReady, setIsAppReady] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole>('user');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [chefProfile, setChefProfile] = useState<ChefProfile>(DEFAULT_CHEF_PROFILE);
  const [customAvatarUrl, setCustomAvatarUrl] = useState('');
  const [selectedCostingInvoiceId, setSelectedCostingInvoiceId] = useState<string | null>(() => getCostingInvoiceIdFromPath(window.location.pathname));
  const [pendingTeamInvitations, setPendingTeamInvitations] = useState<TeamInvitation[]>([]);
  const [processingInvitationId, setProcessingInvitationId] = useState<string | null>(null);
  
  // Notification states
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const currentWorkspaceRole: WorkspaceMemberRole | null = currentUserRole === 'super_admin'
    ? 'Owner'
    : currentUser && currentWorkspace
      ? currentWorkspace.type === 'demo'
        ? 'Owner'
        : normalizeTeamRole(
          currentWorkspace.members.find(member => member.userId === currentUser.uid && member.status === 'Active')?.role
            || (currentWorkspace.ownerId === currentUser.uid ? 'Owner' : undefined)
        )
      : isGuestMode
        ? 'Viewer'
        : null;

  const handleRootNavigate = (tab: RootTab) => {
    if (tab === 'admin' && currentUserRole !== 'super_admin') {
      setActiveTab('home');
      setSelectedCostingInvoiceId(null);
      setIsNavigationDrawerOpen(false);
      window.history.replaceState(null, '', ROOT_TAB_PATHS.home);
      triggerNotification('Admin is only available to MiseChef super admins.', 'info');
      return;
    }

    const shouldEnforceRoleAccess = !SUBSCRIPTION_GATED_PRODUCT_TABS.has(tab);
    const canAccess = !currentUser
      || !currentWorkspace
      || !shouldEnforceRoleAccess
      || canAccessRootTab(tab, currentWorkspaceRole, currentUserRole === 'super_admin');
    if (!canAccess) {
      setActiveTab('home');
      setSelectedCostingInvoiceId(null);
      window.history.replaceState(null, '', ROOT_TAB_PATHS.home);
      triggerNotification('You do not have access to that workspace area.', 'info');
      return;
    }

    setActiveTab(tab);
    if (tab !== 'costingInvoiceDetail') {
      setSelectedCostingInvoiceId(null);
    }
    window.history.replaceState(null, '', ROOT_TAB_PATHS[tab]);
  };

  const handleOpenCostingInvoice = (invoiceId: string) => {
    setSelectedCostingInvoiceId(invoiceId);
    setActiveTab('costingInvoiceDetail');
    window.history.replaceState(null, '', `/app/costing/invoices/${encodeURIComponent(invoiceId)}`);
  };

  // Load from local storage
  useEffect(() => {
    const cachedAppearance = localStorage.getItem(STORAGE_APPEARANCE_KEY);
    document.documentElement.dataset.appearance =
      cachedAppearance === 'light' || cachedAppearance === 'dark' || cachedAppearance === 'system'
        ? cachedAppearance
        : 'system';

    const cachedRecipes = localStorage.getItem(STORAGE_RECIPES_KEY);
    const cachedCategories = localStorage.getItem(STORAGE_CATEGORIES_KEY);
    const localProfile = loadLocalProfile();
    setChefProfile(localProfile);
    setCustomAvatarUrl(localProfile.photo);
    let loadedRecipes = INITIAL_RECIPES;

    if (cachedRecipes) {
      try {
        loadedRecipes = (JSON.parse(cachedRecipes) as Recipe[]).map(normalizeLoadedRecipe);
        setRecipes(loadedRecipes);
      } catch (err) {
        const normalizedInitialRecipes = INITIAL_RECIPES.map(normalizeLoadedRecipe);
        loadedRecipes = normalizedInitialRecipes;
        setRecipes(normalizedInitialRecipes);
      }
    } else {
      const normalizedInitialRecipes = INITIAL_RECIPES.map(normalizeLoadedRecipe);
      loadedRecipes = normalizedInitialRecipes;
      setRecipes(normalizedInitialRecipes);
      localStorage.setItem(STORAGE_RECIPES_KEY, JSON.stringify(normalizedInitialRecipes));
    }

    if (cachedCategories) {
      try {
        const parsedCategories = JSON.parse(cachedCategories);
        const nextCategories = sanitizeCategoryList(parsedCategories);
        setCategories(nextCategories);
        localStorage.setItem(STORAGE_CATEGORIES_KEY, JSON.stringify(nextCategories));
      } catch (err) {
        const initialCategories: RecipeCategory[] = [];
        setCategories(initialCategories);
        localStorage.setItem(STORAGE_CATEGORIES_KEY, JSON.stringify(initialCategories));
      }
    } else {
      const initialCategories: RecipeCategory[] = [];
      setCategories(initialCategories);
      localStorage.setItem(STORAGE_CATEGORIES_KEY, JSON.stringify(initialCategories));
    }

    setIsAppReady(true);
  }, []);

  useEffect(() => {
    if (!auth) {
      setCurrentUser(null);
      setIsAuthReady(true);
      if (isPublicExperiencePath(window.location.pathname) || isMarketingPath(window.location.pathname)) {
        setActiveTab('home');
      } else {
        setActiveTab('login');
        window.history.replaceState(null, '', '/login');
      }
      return;
    }

    let isCancelled = false;
    let unsubscribeAuth: Unsubscribe | null = null;

    const initializeAuth = async () => {
      try {
        await authPersistenceReady;
        await getRedirectResult(auth);
      } catch (err) {
        if (!isCancelled) {
          triggerNotification('Google sign-in could not be completed. Please try again.', 'error');
        }
      } finally {
        if (isCancelled) return;

        unsubscribeAuth = onAuthStateChanged(auth, user => {
          setCurrentUser(user);
          setIsAuthReady(true);

          if (user) {
            setCurrentUserRole(getConfiguredRoleForUser(user));
            setIsGuestMode(false);
            const pathname = window.location.pathname;

            if (isPublicExperiencePath(pathname) || isMarketingPath(pathname)) {
              setSelectedCostingInvoiceId(null);
              setActiveTab('home');
              return;
            }

            const nextTab = getRootTabFromPath(pathname);
            const targetTab = nextTab === 'login' ? 'home' : nextTab;
            setSelectedCostingInvoiceId(getCostingInvoiceIdFromPath(pathname));
            setActiveTab(targetTab);
            if (nextTab !== 'costingInvoiceDetail') {
              window.history.replaceState(null, '', ROOT_TAB_PATHS[targetTab]);
            }
            return;
          }

          setCurrentUserRole('user');
          setWorkspaces([]);
          setCurrentWorkspace(null);
          setAddingRecipe(false);
          setEditingRecipe(null);
          setSelectedRecipe(null);
          setIsNavigationDrawerOpen(false);
          setSelectedHomeCategory(null);
          setIsFavoritesFilterActive(false);
          setIsGuestMode(false);
          if (isPublicExperiencePath(window.location.pathname) || isMarketingPath(window.location.pathname)) {
            setActiveTab('home');
          } else {
            setActiveTab('login');
            window.history.replaceState(null, '', '/login');
          }
        });
      }
    };

    initializeAuth();

    return () => {
      isCancelled = true;
      unsubscribeAuth?.();
    };
  }, []);

  useEffect(() => {
    if (currentUser && activeTab === 'login') {
      handleRootNavigate('home');
    }
  }, [activeTab, currentUser]);

  useEffect(() => {
    if (!currentUser?.email || isGuestMode) {
      setPendingTeamInvitations([]);
      return;
    }

    let isCancelled = false;
    teamService.getPendingInvitations(currentUser.email)
      .then(invitations => {
        if (!isCancelled) setPendingTeamInvitations(invitations);
      })
      .catch(() => {
        if (!isCancelled) setPendingTeamInvitations([]);
      });

    return () => {
      isCancelled = true;
    };
  }, [currentUser, isGuestMode]);

  useEffect(() => {
    if (activeTab === 'admin' && currentUserRole !== 'super_admin') {
      handleRootNavigate('home');
      return;
    }

    if (
      currentUser
      && currentWorkspace
      && !SUBSCRIPTION_GATED_PRODUCT_TABS.has(activeTab)
      && !canAccessRootTab(activeTab, currentWorkspaceRole, currentUserRole === 'super_admin')
    ) {
      handleRootNavigate('home');
    }
  }, [activeTab, currentUser, currentUserRole, currentWorkspace, currentWorkspaceRole]);

  useEffect(() => {
    const pathname = window.location.pathname;
    if (!isAuthReady || currentUser || isGuestMode || activeTab === 'login' || isPublicExperiencePath(pathname) || isMarketingPath(pathname) || pathname === '/login') return;
    if (!isAppPath(pathname) && getRootTabFromPath(pathname) === 'home') return;

    setAddingRecipe(false);
    setEditingRecipe(null);
    setSelectedRecipe(null);
    setIsNavigationDrawerOpen(false);
    setSelectedHomeCategory(null);
    setIsFavoritesFilterActive(false);
    setActiveTab('login');
    window.history.replaceState(null, '', '/login');
  }, [activeTab, currentUser, isAuthReady, isGuestMode]);

  useEffect(() => {
    if (!currentUser || !db || isGuestMode) return;

    let isCancelled = false;

    const initializeFirestoreUser = async () => {
      const workspaceInitialization = workspaceService.listUserWorkspaces(currentUser);
      const accountInitialization = (async () => {
        const role = await createUserDocument(currentUser);
        const cloudProfile = await loadFirestoreProfile(currentUser);
        return { role, cloudProfile };
      })();

      const [workspaceResult, accountResult] = await Promise.allSettled([
        workspaceInitialization,
        accountInitialization
      ]);

      if (isCancelled) return;

      if (workspaceResult.status === 'fulfilled') {
        const loadedWorkspaces = workspaceResult.value;
        const selectedWorkspace = workspaceService.resolveSelectedWorkspace(currentUser, loadedWorkspaces);
        setWorkspaces(loadedWorkspaces);
        setCurrentWorkspace(selectedWorkspace);
        if (selectedWorkspace) {
          workspaceService.setStoredWorkspaceId(currentUser.uid, selectedWorkspace.id);
        }
      }

      if (accountResult.status === 'fulfilled') {
        setCurrentUserRole(accountResult.value.role);
        const cloudProfile = accountResult.value.cloudProfile;
        if (cloudProfile) {
          setChefProfile(cloudProfile);
          setCustomAvatarUrl(cloudProfile.photo);
          localStorage.setItem(STORAGE_PROFILE_KEY, JSON.stringify(cloudProfile));
        }
      }
    };

    initializeFirestoreUser();

    return () => {
      isCancelled = true;
    };
  }, [currentUser, isGuestMode]);

  useEffect(() => {
    if (!currentUser || !db || isGuestMode || !currentWorkspace) return;

    let isCancelled = false;

    const loadWorkspaceData = async () => {
      try {
        const [cloudRecipes, cloudCategories] = await Promise.all([
          loadFirestoreRecipes(currentUser, currentWorkspace.id),
          loadFirestoreCategories(currentUser, currentWorkspace.id)
        ]);

        if (!isCancelled) {
          setRecipes(cloudRecipes);
          setCategories(cloudCategories);
          localStorage.setItem(STORAGE_CATEGORIES_KEY, JSON.stringify(cloudCategories));
          setSelectedHomeCategory(null);
          setIsFavoritesFilterActive(false);
          setSelectedRecipe(null);
        }
      } catch (err) {
        if (!isCancelled) {
          triggerNotification("We couldn't load your workspace recipes. Please refresh the page or try again.", 'info');
        }
      }
    };

    loadWorkspaceData();

    return () => {
      isCancelled = true;
    };
  }, [currentUser, currentWorkspace, isGuestMode]);

  // Save changes helper
  const saveRecipesToStorage = (newList: Recipe[]) => {
    const normalizedList = newList.map(normalizeLoadedRecipe);
    setRecipes(normalizedList);
    localStorage.setItem(STORAGE_RECIPES_KEY, JSON.stringify(normalizedList));
  };

  const saveCategoriesToStorage = (newList: RecipeCategory[]) => {
    setCategories(newList);
    localStorage.setItem(STORAGE_CATEGORIES_KEY, JSON.stringify(newList));
  };

  const handleCreateCategory = (name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) return null;
    if (trimmedName.toLowerCase() === FALLBACK_CATEGORY_NAME.toLowerCase()) {
      triggerNotification(`"${FALLBACK_CATEGORY_NAME}" is reserved for uncategorized recipes.`, 'info');
      return null;
    }

    const existingCategory = categories.find(
      category => category.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (existingCategory) return existingCategory;

    const newCategory = createCategoryRecord(trimmedName);
    saveCategoriesToStorage([...categories, newCategory]);
    if (currentUser && db && !isGuestMode) {
      saveCategoryToFirestore(newCategory, currentUser, activeWorkspaceId).catch(() => {
        triggerNotification(`Created "${newCategory.name}" on this device. Please refresh if it does not appear everywhere.`, 'info');
      });
    }
    triggerNotification(`Created category "${newCategory.name}".`, 'success');
    return newCategory;
  };

  const handleRenameCategory = (categoryId: string, nextName: string) => {
    const trimmedName = nextName.trim();
    if (!trimmedName) return;
    if (trimmedName.toLowerCase() === FALLBACK_CATEGORY_NAME.toLowerCase()) {
      triggerNotification(`"${FALLBACK_CATEGORY_NAME}" is reserved for uncategorized recipes.`, 'info');
      return;
    }

    const category = categories.find(item => item.id === categoryId);
    if (!category) return;
    const duplicate = categories.find(
      item => item.id !== categoryId && item.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicate) {
      triggerNotification(`Category "${trimmedName}" already exists.`, 'error');
      return;
    }

    const updatedCategories = categories.map(item =>
      item.id === categoryId ? { ...item, name: trimmedName, updatedAt: new Date().toISOString() } : item
    );
    const updatedRecipes = recipes.map(recipe => {
      if (!recipeHasCategory(recipe, category.name)) return recipe;
      const nextCategories = getRecipeCategories(recipe).map(recipeCategory =>
        recipeCategory === category.name ? trimmedName : recipeCategory
      );
      return { ...recipe, category: nextCategories[0], categories: nextCategories };
    });

    saveCategoriesToStorage(updatedCategories);
    saveRecipesToStorage(updatedRecipes);
    if (currentUser && db && !isGuestMode) {
      Promise.all([
        saveCategoryToFirestore({ ...category, name: trimmedName, updatedAt: new Date().toISOString() }, currentUser, activeWorkspaceId),
        ...updatedRecipes
          .filter(recipe => recipeHasCategory(recipe, trimmedName))
          .map(recipe => saveRecipeToFirestore(recipe, currentUser, activeWorkspaceId))
      ]).catch(() => {
        triggerNotification(`Renamed "${category.name}" on this device. Please refresh if it does not appear everywhere.`, 'info');
      });
    }
    if (selectedHomeCategory === category.name) {
      setSelectedHomeCategory(trimmedName);
    }
    triggerNotification(`Renamed "${category.name}" to "${trimmedName}".`, 'success');
  };

  const handleDeleteCategory = (categoryId: string, targetCategoryName: string) => {
    const category = categories.find(item => item.id === categoryId);
    if (!category) return;

    const finalTarget = targetCategoryName.trim();
    const targetExists = finalTarget && categories.some(item => item.name === finalTarget);
    const nextCategories = targetExists || !finalTarget
      ? categories.filter(item => item.id !== categoryId)
      : [...categories.filter(item => item.id !== categoryId), createCategoryRecord(finalTarget)];
    const affectedRecipeIds = new Set(
      recipes
        .filter(recipe => recipeHasCategory(recipe, category.name))
        .map(recipe => recipe.id)
    );

    const updatedRecipes = recipes.map(recipe => {
      if (!recipeHasCategory(recipe, category.name)) return recipe;
      const withoutDeleted = getRecipeCategories(recipe).filter(recipeCategory => recipeCategory !== category.name);
      const nextCategories = finalTarget
        ? normalizeRecipeCategories([...withoutDeleted, finalTarget])
        : withoutDeleted;
      return { ...recipe, category: nextCategories[0] || '', categories: nextCategories };
    });

    saveCategoriesToStorage(nextCategories);
    saveRecipesToStorage(updatedRecipes);
    if (currentUser && db && !isGuestMode) {
      Promise.all([
        deleteCategoryFromFirestore(category.id),
        ...updatedRecipes
          .filter(recipe => affectedRecipeIds.has(recipe.id))
          .map(recipe => saveRecipeToFirestore(recipe, currentUser, activeWorkspaceId))
      ]).catch(() => {
        triggerNotification(`Deleted "${category.name}" on this device. Please refresh if it still appears elsewhere.`, 'info');
      });
    }
    if (selectedHomeCategory === category.name) {
      setSelectedHomeCategory(finalTarget || null);
    }
    triggerNotification(
      finalTarget
        ? `Deleted "${category.name}" and moved recipes to "${finalTarget}".`
        : `Deleted "${category.name}" and left recipes uncategorized.`,
      'info'
    );
  };

  // Trigger brief alert notification banner
  const triggerNotification = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  // Add Recipe
  const handleSaveNewRecipe = async (newRecipe: Recipe) => {
    if (currentUser && db && !isGuestMode) {
      const limitCheck = await usageLimitService.canCreateResource(activeWorkspaceId, 'recipe', recipes.length);
      if (!limitCheck.allowed) {
        triggerNotification(limitCheck.message, 'info');
        return;
      }
    }

    setAddingRecipe(false);
    setActiveTab('home');

    if (currentUser && db && !isGuestMode) {
      try {
        const cloudRecipe = await getCloudReadyRecipe(newRecipe, currentUser, (progress, phase) => {
          triggerNotification(`Uploading ${phase === 'scan' ? 'recipe scan' : 'cover image'}... ${progress}%`, 'info');
        });
        const costedRecipe = await recipeCostService.applyCosting(cloudRecipe, currentUser.uid, activeWorkspaceId);
        const updated = [costedRecipe, ...recipes];
        setRecipes(updated);
        await saveRecipeToFirestore(costedRecipe, currentUser, activeWorkspaceId);
        triggerNotification(`Saved "${costedRecipe.title}" to your cookbook.`, 'success');
      } catch (err) {
        const updated = [newRecipe, ...recipes];
        setRecipes(updated);
        localStorage.setItem(STORAGE_RECIPES_KEY, JSON.stringify(updated));
        triggerNotification(`Saved "${newRecipe.title}" on this device. Please try again if it does not appear everywhere.`, 'info');
      }
    } else {
      const updated = [newRecipe, ...recipes];
      setRecipes(updated);
      localStorage.setItem(STORAGE_RECIPES_KEY, JSON.stringify(updated));
      triggerNotification(`Saved "${newRecipe.title}" on this device. Sign in to keep future recipes available across your workspace.`, 'success');
    }
  };

  const handleSaveEditedRecipe = async (updatedRecipe: Recipe) => {
    setEditingRecipe(null);
    setActiveTab('home');

    if (currentUser && db && !isGuestMode) {
      try {
        const cloudRecipe = await getCloudReadyRecipe(updatedRecipe, currentUser, (progress, phase) => {
          triggerNotification(`Uploading ${phase === 'scan' ? 'recipe scan' : 'cover image'}... ${progress}%`, 'info');
        });
        const costedRecipe = await recipeCostService.applyCosting(cloudRecipe, currentUser.uid, activeWorkspaceId);
        const updated = recipes.map(recipe =>
          recipe.id === costedRecipe.id ? costedRecipe : recipe
        );
        setRecipes(updated);
        setSelectedRecipe(costedRecipe);
        await saveRecipeToFirestore(costedRecipe, currentUser, activeWorkspaceId);
        triggerNotification(`Updated "${costedRecipe.title}".`, 'success');
      } catch (err) {
        const updated = recipes.map(recipe =>
          recipe.id === updatedRecipe.id ? updatedRecipe : recipe
        );
        setRecipes(updated);
        setSelectedRecipe(updatedRecipe);
        localStorage.setItem(STORAGE_RECIPES_KEY, JSON.stringify(updated));
        triggerNotification(`Updated "${updatedRecipe.title}" on this device. Please try again if it does not appear everywhere.`, 'info');
      }
    } else {
      const updated = recipes.map(recipe =>
        recipe.id === updatedRecipe.id ? updatedRecipe : recipe
      );
      setRecipes(updated);
      setSelectedRecipe(updatedRecipe);
      localStorage.setItem(STORAGE_RECIPES_KEY, JSON.stringify(updated));
      triggerNotification(`Updated "${updatedRecipe.title}".`, 'success');
    }
  };

  const handleStartEditRecipe = (recipe: Recipe) => {
    setSelectedRecipe(null);
    setEditingRecipe(recipe);
  };

  const handleDuplicateRecipe = async (recipe: Recipe) => {
    if (currentUser && db && !isGuestMode) {
      const limitCheck = await usageLimitService.canCreateResource(activeWorkspaceId, 'recipe', recipes.length);
      if (!limitCheck.allowed) {
        triggerNotification(limitCheck.message, 'info');
        return;
      }
    }

    const duplicatedRecipe: Recipe = {
      ...recipe,
      id: `recipe_${Date.now()}`,
      title: `${recipe.title} Copy`,
      scanAttachmentUrl: undefined,
      scannedImageDataUrl: undefined,
      isSaved: false,
      createdAt: new Date().toISOString()
    };
    const updatedRecipes = [duplicatedRecipe, ...recipes];
    setRecipes(updatedRecipes);
    setSelectedRecipe(null);
    setActiveTab('home');

    if (currentUser && db && !isGuestMode) {
      try {
        const cloudRecipe = await getCloudReadyRecipe(duplicatedRecipe, currentUser, (progress, phase) => {
          triggerNotification(`Uploading ${phase === 'scan' ? 'recipe scan' : 'cover image'}... ${progress}%`, 'info');
        });
        const updated = [cloudRecipe, ...recipes];
        setRecipes(updated);
        await saveRecipeToFirestore(cloudRecipe, currentUser, activeWorkspaceId);
        triggerNotification(`Duplicated "${recipe.title}".`, 'success');
      } catch (err) {
        localStorage.setItem(STORAGE_RECIPES_KEY, JSON.stringify(updatedRecipes));
        triggerNotification(`Duplicated "${recipe.title}" on this device. Please try again if it does not appear everywhere.`, 'info');
      }
      return;
    }

    localStorage.setItem(STORAGE_RECIPES_KEY, JSON.stringify(updatedRecipes));
    triggerNotification(`Duplicated "${recipe.title}".`, 'success');
  };

  const handleShareRecipe = async (recipe: Recipe) => {
    const shareText = [
      recipe.title,
      recipe.yield ? `Yield: ${recipe.yield}` : '',
      '',
      'Ingredients:',
      ...recipe.ingredients.map(ingredient =>
        [ingredient.qty, ingredient.unit, ingredient.name].filter(Boolean).join(' ')
      ),
      '',
      'Method:',
      ...recipe.method.map(step => `${step.stepNumber}. ${step.description}`)
    ].filter(Boolean).join('\n');

    try {
      if (navigator.share) {
        await navigator.share({
          title: recipe.title,
          text: shareText
        });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareText);
        triggerNotification('Recipe copied to clipboard.', 'success');
      } else {
        triggerNotification('Sharing is not available in this browser.', 'info');
      }
    } catch (err) {
      triggerNotification('Share was cancelled or could not be completed.', 'info');
    }
  };

  const handleDeleteRecipe = async (recipe: Recipe) => {
    const confirmed = window.confirm('Delete this recipe? This action cannot be undone.');
    if (!confirmed) return;

    const updatedRecipes = recipes.filter(item => item.id !== recipe.id);
    setRecipes(updatedRecipes);
    setSelectedRecipe(null);
    setActiveTab('home');

    if (currentUser && db && !isGuestMode) {
      try {
        await deleteRecipeFromFirestore(recipe.id);
        Promise.all([
          deleteRecipeCoverImage(currentUser.uid, recipe.id),
          deleteRecipeScanAttachment(currentUser.uid, recipe.id)
        ]).catch(err => {
          console.warn('Recipe storage cleanup failed after recipe deletion.', err);
        });
        triggerNotification(`Deleted "${recipe.title}".`, 'info');
      } catch (err) {
        setRecipes(recipes);
        setSelectedRecipe(recipe);
        triggerNotification(`We couldn't finish deleting "${recipe.title}". Please try again.`, 'error');
      }
      return;
    }

    localStorage.setItem(STORAGE_RECIPES_KEY, JSON.stringify(updatedRecipes));
    triggerNotification(`Deleted "${recipe.title}".`, 'info');
  };

  const handleCancelRecipeForm = () => {
    setAddingRecipe(false);
    setEditingRecipe(null);
  };

  const handleToggleFavorite = async (recipeId: string) => {
    const updatedRecipes = recipes.map(recipe =>
      recipe.id === recipeId ? { ...recipe, isSaved: !recipe.isSaved } : recipe
    );
    saveRecipesToStorage(updatedRecipes);

    const updatedSelectedRecipe = updatedRecipes.find(recipe => recipe.id === selectedRecipe?.id);
    if (updatedSelectedRecipe) {
      setSelectedRecipe(updatedSelectedRecipe);
    }

    if (currentUser && db && !isGuestMode) {
      const updatedRecipe = updatedRecipes.find(recipe => recipe.id === recipeId);
      if (!updatedRecipe) return;

      try {
        await saveRecipeToFirestore(updatedRecipe, currentUser, activeWorkspaceId);
      } catch (err) {
        saveRecipesToStorage(recipes);
        const previousSelectedRecipe = recipes.find(recipe => recipe.id === selectedRecipe?.id);
        if (previousSelectedRecipe) {
          setSelectedRecipe(previousSelectedRecipe);
        }
        triggerNotification('Could not update favorite. Please try again.', 'error');
      }
    }
  };

  const getValidImportedRecipes = (importedRecipes: Recipe[]) => {
    return importedRecipes.filter(recipe =>
      recipe &&
      typeof recipe.id === 'string' &&
      typeof recipe.title === 'string' &&
      Array.isArray(recipe.ingredients) &&
      Array.isArray(recipe.method)
    );
  };

  const getValidImportedCategories = (importedCategories: RecipeCategory[]) => {
    return importedCategories.filter(category =>
      category &&
      typeof category.name === 'string' &&
      category.name.trim()
    );
  };

  const handleImportAppData = (importedData: ImportedAppData, mode: 'merge' | 'replace') => {
    const validRecipes = getValidImportedRecipes(importedData.recipes);
    const validCategories = getValidImportedCategories(importedData.categories);
    const normalizedValidRecipes = validRecipes.map(normalizeLoadedRecipe);

    if (normalizedValidRecipes.length === 0) {
      triggerNotification('No valid recipes found in the selected file.', 'error');
      return;
    }

    if (mode === 'replace') {
      const nextCategories = sanitizeCategoryList(
        validCategories.length > 0 ? validCategories : buildInitialCategories(normalizedValidRecipes)
      );
      saveRecipesToStorage(normalizedValidRecipes);
      saveCategoriesToStorage(nextCategories);
    } else {
      const existingIds = new Set(recipes.map(recipe => recipe.id));
      const normalizedImportedRecipes = normalizedValidRecipes.map(recipe => ({
        ...recipe,
        id: existingIds.has(recipe.id) ? `recipe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` : recipe.id
      }));
      const updatedRecipes = [...normalizedImportedRecipes, ...recipes];
      saveRecipesToStorage(updatedRecipes);

      const categoryMap = new Map<string, RecipeCategory>();
      categories.forEach(category => categoryMap.set(category.name.toLowerCase(), category));
      validCategories.forEach(category => {
        const key = category.name.trim().toLowerCase();
        if (!categoryMap.has(key)) {
          categoryMap.set(key, {
            ...category,
            id: category.id || createCategoryRecord(category.name).id,
            name: category.name.trim()
          });
        }
      });

      normalizedImportedRecipes.forEach(recipe => {
        getRecipeCategories(recipe).forEach(categoryName => {
          if (categoryName && !categoryMap.has(categoryName.toLowerCase())) {
            categoryMap.set(categoryName.toLowerCase(), createCategoryRecord(categoryName));
          }
        });
      });

      const nextCategories = sanitizeCategoryList(Array.from(categoryMap.values()));
      saveCategoriesToStorage(nextCategories);
    }

    if (importedData.profile) {
      localStorage.setItem(STORAGE_PROFILE_KEY, JSON.stringify(importedData.profile));
    }

    triggerNotification(
      `${mode === 'replace' ? 'Replaced' : 'Merged'} ${normalizedValidRecipes.length} recipes and ${validCategories.length} categories.`,
      'success'
    );
  };

  const handleResetApp = () => {
    Object.keys(localStorage)
      .filter(key => key.startsWith('ce_lims_kitchen_') || key.startsWith('my_cookbook_'))
      .forEach(key => localStorage.removeItem(key));

    const resetCategories: RecipeCategory[] = [];
    setRecipes([]);
    setCategories(resetCategories);
    setCustomAvatarUrl('');
    localStorage.setItem(STORAGE_RECIPES_KEY, JSON.stringify([]));
    localStorage.setItem(STORAGE_CATEGORIES_KEY, JSON.stringify(resetCategories));
    document.documentElement.dataset.appearance = 'system';
    setSelectedHomeCategory(null);
    setIsFavoritesFilterActive(false);
    setActiveTab('home');
    triggerNotification('Reset complete. Your saved data on this device has been cleared.', 'info');
  };

  const handleSignOut = async () => {
    if (!auth) {
      triggerNotification('Sign-in is temporarily unavailable. Please try again shortly.', 'info');
      return;
    }

    try {
      await signOut(auth);
      setCurrentUser(null);
      setCurrentUserRole('user');
      setWorkspaces([]);
      setCurrentWorkspace(null);
      setIsGuestMode(false);
      setRecipes(loadLocalRecipes());
      setAddingRecipe(false);
      setEditingRecipe(null);
      setSelectedRecipe(null);
      setIsNavigationDrawerOpen(false);
      setSelectedHomeCategory(null);
      setIsFavoritesFilterActive(false);
      setActiveTab('login');
      window.history.replaceState(null, '', '/login');
      triggerNotification('Signed out successfully.', 'info');
    } catch (err) {
      triggerNotification('Unable to sign out. Please try again.', 'error');
    }
  };

  const homeRecipes = isFavoritesFilterActive
    ? recipes.filter(recipe => recipe.isSaved)
    : selectedHomeCategory
      ? recipes.filter(recipe => recipeHasCategory(recipe, selectedHomeCategory))
      : recipes;
  const categoryCounts = categories.reduce<Record<string, number>>((acc, category) => {
    acc[category.name] = recipes.filter(recipe => recipeHasCategory(recipe, category.name)).length;
    return acc;
  }, {});

  const activeWorkspaceId = currentWorkspace?.id || currentUser?.uid || '';

  const handleWorkspaceChange = (workspaceId: string) => {
    const nextWorkspace = workspaces.find(workspace => workspace.id === workspaceId);
    if (!nextWorkspace || !currentUser) return;

    workspaceService.setStoredWorkspaceId(currentUser.uid, nextWorkspace.id);
    setCurrentWorkspace(nextWorkspace);
    setAddingRecipe(false);
    setEditingRecipe(null);
    setSelectedRecipe(null);
    setSelectedCostingInvoiceId(null);
    setSelectedHomeCategory(null);
    setIsFavoritesFilterActive(false);
  };

  const portfolioProfile = {
    displayName: chefProfile.name || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Chef',
    avatarUrl: customAvatarUrl || chefProfile.photo || currentUser?.photoURL || '',
    email: currentUser?.email || ''
  };

  const portfolioData = {
    basicProfile: {
      professionalTitle: chefProfile.jobTitle || '',
      yearsExperience: chefProfile.yearsExperience || '',
      shortBio: chefProfile.bio || '',
      quote: chefProfile.quote || ''
    }
  };

  // Renders correct active screen body
  const handleAuthenticated = () => {
    setIsGuestMode(false);
    handleRootNavigate('home');
  };

  const handleContinueAsGuest = () => {
    setCurrentUser(null);
    setCurrentUserRole('user');
    setWorkspaces([]);
    setCurrentWorkspace(null);
    setIsGuestMode(true);
    const localProfile = loadLocalProfile();
    setChefProfile(localProfile);
    setCustomAvatarUrl(localProfile.photo);
    setRecipes(loadLocalRecipes());
    handleRootNavigate('home');
  };

  const handleAvatarClick = () => {
    setAddingRecipe(false);
    setEditingRecipe(null);
    setSelectedRecipe(null);
    setIsNavigationDrawerOpen(false);

    if (currentUser) {
      handleRootNavigate('profile');
      return;
    }

    setIsGuestMode(false);
    handleRootNavigate('login');
  };

  const handleAcceptTeamInvitation = async (invitation: TeamInvitation) => {
    if (!currentUser) return;
    setProcessingInvitationId(invitation.id);

    try {
      await teamService.acceptInvitation(invitation, currentUser);
      const nextWorkspaces = await workspaceService.listAccessibleWorkspaces(currentUser);
      const acceptedWorkspace = nextWorkspaces.find(workspace => workspace.id === invitation.workspaceId);
      setWorkspaces(nextWorkspaces);
      if (acceptedWorkspace) {
        workspaceService.setStoredWorkspaceId(currentUser.uid, acceptedWorkspace.id);
        setCurrentWorkspace(acceptedWorkspace);
      }
      setPendingTeamInvitations(current => current.filter(item => item.id !== invitation.id));
      triggerNotification(`Joined ${invitation.workspaceName} as ${invitation.role}.`, 'success');
    } catch (err) {
      triggerNotification(err instanceof Error ? err.message : 'Invitation could not be accepted. Please try again.', 'error');
    } finally {
      setProcessingInvitationId(null);
    }
  };

  const handleDeclineTeamInvitation = async (invitation: TeamInvitation) => {
    if (!currentUser) return;
    setProcessingInvitationId(invitation.id);

    try {
      await teamService.declineInvitation(invitation, currentUser);
      setPendingTeamInvitations(current => current.filter(item => item.id !== invitation.id));
      triggerNotification(`Invitation to ${invitation.workspaceName} declined.`, 'info');
    } catch (err) {
      triggerNotification(err instanceof Error ? err.message : 'Invitation could not be declined. Please try again.', 'error');
    } finally {
      setProcessingInvitationId(null);
    }
  };

  const renderTabContent = () => {
    if (!currentUser && !isGuestMode) {
      return (
        <LoginTab
          currentUser={currentUser}
          onAuthenticated={handleAuthenticated}
          onContinueAsGuest={handleContinueAsGuest}
        />
      );
    }

    switch (activeTab) {
      case 'home':
        return (
          <HomeTab
            recipes={homeRecipes}
            allRecipes={recipes}
            workspaceRole={currentWorkspaceRole}
            selectedCategory={selectedHomeCategory}
            isFavoritesFilter={isFavoritesFilterActive}
            onSelectRecipe={setSelectedRecipe}
            onToggleFavorite={handleToggleFavorite}
            currentUser={currentUser}
            workspaceId={activeWorkspaceId}
            profile={chefProfile}
            customAvatarUrl={customAvatarUrl}
            portfolio={{
              professionalTitle: portfolioData.basicProfile.professionalTitle,
              yearsExperience: portfolioData.basicProfile.yearsExperience,
              bio: portfolioData.basicProfile.shortBio,
              quote: portfolioData.basicProfile.quote
            }}
            onCreateRecipe={() => setAddingRecipe(true)}
            onNavigate={handleRootNavigate}
          />
        );
      case 'favorites':
        return (
          <FavoritesTab
            recipes={recipes}
            collections={collections}
            onAddCollection={() => undefined}
            onSelectRecipe={setSelectedRecipe}
            onToggleSave={handleToggleFavorite}
          />
        );
      case 'statistics':
        return (
          <StatisticsTab
            recipes={recipes}
            categories={categories}
          />
        );
      case 'portfolio':
        return (
          <PortfolioPage
            profile={portfolioProfile}
            initialPortfolio={portfolioData}
            recipes={recipes}
            userId={currentUser?.uid}
            workspaceId={activeWorkspaceId}
          />
        );
      case 'admin':
        if (currentUserRole !== 'super_admin') {
          return (
            <div className="min-h-[60vh] px-4 py-10 sm:px-6 lg:px-8">
              <div className="mx-auto max-w-2xl rounded-3xl border border-surface-container-high bg-surface-container-low p-8 text-center shadow-sm">
                <p className="font-sans text-xs font-extrabold uppercase tracking-[0.18em] text-secondary">403</p>
                <h1 className="mt-3 font-display text-3xl font-semibold text-primary">Admin access restricted</h1>
                <p className="mt-3 font-sans text-sm font-bold leading-relaxed text-on-surface-variant">
                  The Admin console is only available to MiseChef super admins. Customer and demo workspaces cannot access this area.
                </p>
                <button
                  type="button"
                  onClick={() => handleRootNavigate('home')}
                  className="mt-6 rounded-full bg-primary px-5 py-3 font-sans text-sm font-extrabold text-on-primary transition-all active:scale-95"
                >
                  Back to App
                </button>
              </div>
            </div>
          );
        }

        return <AdminPage />;
      case 'costing':
      case 'costingIngredients':
      case 'costingInvoices':
      case 'costingInvoiceDetail':
      case 'costingReports':
        return <CostingPage activeTab={activeTab} userId={currentUser?.uid} workspaceId={activeWorkspaceId} userRole={currentUserRole === 'super_admin' || currentWorkspaceRole === 'Owner' || currentWorkspaceRole === 'Manager' || currentWorkspaceRole === 'Head Chef' ? 'admin' : 'user'} invoiceId={selectedCostingInvoiceId} onOpenInvoice={handleOpenCostingInvoice} onBackToInvoices={() => handleRootNavigate('costingInvoices')} />;
      case 'business':
      case 'businessSales':
      case 'businessSuppliers':
        return <BusinessPage activeTab={activeTab} userId={currentUser?.uid} workspaceId={activeWorkspaceId} />;
      case 'team':
        return (
          <TeamPage
            userId={currentUser?.uid}
            userEmail={currentUser?.email}
            displayName={currentUser?.displayName}
            workspaceId={activeWorkspaceId}
            workspaceRole={currentWorkspaceRole}
          />
        );
      case 'search':
        return (
          <SearchTab
            recipes={recipes}
            categories={categories}
            onSelectRecipe={setSelectedRecipe}
            onCreateCategory={handleCreateCategory}
            onRenameCategory={handleRenameCategory}
            onDeleteCategory={handleDeleteCategory}
            onToggleFavorite={handleToggleFavorite}
            selectedCategory={selectedHomeCategory}
          />
        );
      case 'settings':
        return (
          <SettingsTab
            mode="settings"
            recipes={recipes}
            categories={categories}
            onImportAppData={handleImportAppData}
            onResetApp={handleResetApp}
            onOpenLogin={() => setActiveTab('login')}
            currentUser={currentUser}
            profile={chefProfile}
            customAvatarUrl={customAvatarUrl}
            onCustomAvatarChange={setCustomAvatarUrl}
            onProfileChange={nextProfile => {
              setChefProfile(nextProfile);
              setCustomAvatarUrl(nextProfile.photo);
            }}
            onSignOut={handleSignOut}
            onNotify={triggerNotification}
          />
        );
      case 'billing':
        return (
          <SubscriptionCenterPage
            workspaceId={activeWorkspaceId}
            currentWorkspace={currentWorkspace}
            recipeCount={recipes.length}
          />
        );
      case 'profile':
        return (
          <SettingsTab
            mode="profile"
            recipes={recipes}
            categories={categories}
            onImportAppData={handleImportAppData}
            onResetApp={handleResetApp}
            onOpenLogin={() => setActiveTab('login')}
            currentUser={currentUser}
            profile={chefProfile}
            customAvatarUrl={customAvatarUrl}
            onCustomAvatarChange={setCustomAvatarUrl}
            onProfileChange={nextProfile => {
              setChefProfile(nextProfile);
              setCustomAvatarUrl(nextProfile.photo);
            }}
            onSignOut={handleSignOut}
            onNotify={triggerNotification}
          />
        );
      case 'login':
        if (currentUser) {
          return (
            <HomeTab
              recipes={homeRecipes}
              allRecipes={recipes}
              workspaceRole={currentWorkspaceRole}
              selectedCategory={selectedHomeCategory}
              isFavoritesFilter={isFavoritesFilterActive}
              onSelectRecipe={setSelectedRecipe}
              onToggleFavorite={handleToggleFavorite}
              currentUser={currentUser}
              workspaceId={activeWorkspaceId}
              profile={chefProfile}
              customAvatarUrl={customAvatarUrl}
              portfolio={{
                professionalTitle: portfolioData.basicProfile.professionalTitle,
                yearsExperience: portfolioData.basicProfile.yearsExperience,
                bio: portfolioData.basicProfile.shortBio,
                quote: portfolioData.basicProfile.quote
              }}
            />
          );
        }

        return (
          <LoginTab
            currentUser={currentUser}
            onAuthenticated={handleAuthenticated}
            onContinueAsGuest={handleContinueAsGuest}
          />
        );
      default:
        return null;
    }
  };

  // Header Contextual configuration
  const getHeaderProps = () => {
    if (addingRecipe || editingRecipe) {
      return {
        title: editingRecipe ? 'Edit Recipe' : 'Add New Recipe',
        isSubpage: true,
        onBack: handleCancelRecipeForm,
        rightAction: (
          <button
            onClick={() => {
              // Click the hidden submit button on child form
              document.getElementById('add-recipe-hidden-save-btn')?.click();
            }}
            id="app-bar-save-recipe-btn"
            className="bg-primary text-on-primary font-sans font-extrabold text-xs px-6 py-2 rounded-full hover:opacity-90 active:scale-95 transition-all outline-none"
          >
            Save
          </button>
        )
      };
    }

    // Default main navigation header
    return {
      title: "MiseChef",
      isSubpage: false,
      activeTab: activeTab,
      chefAvatarUrl: customAvatarUrl || chefProfile.photo || currentUser?.photoURL || undefined,
      chefName: chefProfile.name || currentUser?.displayName || currentUser?.email || 'User profile',
      showAvatar: Boolean(currentUser),
      onAvatarClick: handleAvatarClick,
      onMenuClick: () => setIsNavigationDrawerOpen(true),
      workspaces,
      currentWorkspace,
      onWorkspaceChange: handleWorkspaceChange
    };
  };

  const isProtectedShellVisible = currentUser || isGuestMode;

  if (!isAppReady || !isAuthReady) {
    return <BrandLoadingScreen />;
  }

  if (isPublicExperiencePath(window.location.pathname)) {
    return <PublicLayout pathname={window.location.pathname} />;
  }

  if (isMarketingPath(window.location.pathname)) {
    return <MarketingPage initialSection={MARKETING_SECTION_BY_PATH[window.location.pathname]} />;
  }

  if (!isProtectedShellVisible && window.location.pathname === '/login') {
    return (
      <LoginTab
        currentUser={currentUser}
        onAuthenticated={handleAuthenticated}
        onContinueAsGuest={handleContinueAsGuest}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col font-sans selection:bg-secondary/20 bg-background relative overflow-x-hidden">
      {/* Dynamic Header */}
      <Header {...getHeaderProps()} />

      <AnimatePresence>
        {currentUser && pendingTeamInvitations.length > 0 && (
          <motion.div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="team-invitation-title"
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="w-full max-w-lg rounded-3xl border border-surface-container-high bg-background p-6 shadow-2xl"
            >
              <p className="font-sans text-xs font-extrabold uppercase tracking-[0.18em] text-secondary">Team invitation</p>
              <h2 id="team-invitation-title" className="mt-2 font-display text-3xl font-semibold text-primary">
                You’ve been invited
              </h2>
              <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">
                This invitation matches {currentUser.email}. Choose whether to join the workspace.
              </p>

              <div className="mt-5 space-y-3">
                {pendingTeamInvitations.map(invitation => {
                  const isProcessing = processingInvitationId === invitation.id;
                  return (
                    <div key={invitation.id} className="rounded-2xl bg-surface-container-low p-4">
                      <p className="font-sans text-base font-extrabold text-primary">{invitation.workspaceName}</p>
                      <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">Assigned role: {invitation.role}</p>
                      <div className="mt-4 flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={Boolean(processingInvitationId)}
                          onClick={() => handleDeclineTeamInvitation(invitation)}
                          className="rounded-full bg-surface-container px-4 py-2.5 font-sans text-xs font-extrabold text-primary disabled:opacity-50"
                        >
                          {isProcessing ? 'Working…' : 'Decline'}
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(processingInvitationId)}
                          onClick={() => handleAcceptTeamInvitation(invitation)}
                          className="rounded-full bg-primary px-4 py-2.5 font-sans text-xs font-extrabold text-on-primary disabled:opacity-50"
                        >
                          {isProcessing ? 'Working…' : 'Accept'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      {isProtectedShellVisible && !addingRecipe && !editingRecipe && (
        <NavigationDrawer
          isOpen={isNavigationDrawerOpen}
          categories={categories}
          activeTab={activeTab}
          selectedCategory={selectedHomeCategory}
          isFavoritesFilterActive={isFavoritesFilterActive}
          categoryCounts={categoryCounts}
          onClose={() => setIsNavigationDrawerOpen(false)}
          onNavigate={handleRootNavigate}
          onSelectCategory={(categoryName) => {
            setSelectedHomeCategory(categoryName);
            setIsFavoritesFilterActive(false);
          }}
          onSelectFavorites={() => {
            setSelectedHomeCategory(null);
            setIsFavoritesFilterActive(true);
          }}
          currentUser={currentUser}
          currentUserRole={currentUserRole}
          workspaceRole={currentWorkspaceRole}
          workspaceId={activeWorkspaceId}
          customAvatarUrl={customAvatarUrl}
          onRenameCategory={handleRenameCategory}
          onDeleteCategory={handleDeleteCategory}
          onSignOut={handleSignOut}
        />
      )}

      {/* Floating Alerts Dialog Banner */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-20 left-4 right-4 md:left-auto md:right-8 md:max-w-md z-50 p-4 rounded-xl border shadow-lg flex items-center gap-3 backdrop-blur-md font-semibold text-xs transition-all"
            style={{
              backgroundColor: notification.type === 'success' ? '#273f2b' : '#3c392e',
              color: '#ffffff',
              borderColor: 'rgba(255,255,255,0.1)'
            }}
          >
            <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-sm shrink-0">
              {notification.type === 'success' ? '✨' : '📝'}
            </div>
            <p className="flex-1 font-sans">{notification.message}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Scaffold Layout Wrapper */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 md:px-8 pt-24 pb-28 md:pb-16">
        {editingRecipe ? (
          <AddRecipeTab
            initialRecipe={editingRecipe}
            mode="edit"
            categories={categories}
            onCreateCategory={handleCreateCategory}
            onRenameCategory={handleRenameCategory}
            onDeleteCategory={handleDeleteCategory}
            onSave={handleSaveEditedRecipe}
            onCancel={handleCancelRecipeForm}
            userRole={currentUserRole}
            userId={currentUser?.uid}
          />
        ) : addingRecipe ? (
          <AddRecipeTab
            categories={categories}
            onCreateCategory={handleCreateCategory}
            onRenameCategory={handleRenameCategory}
            onDeleteCategory={handleDeleteCategory}
            onSave={handleSaveNewRecipe}
            onCancel={handleCancelRecipeForm}
            userRole={currentUserRole}
            userId={currentUser?.uid}
          />
        ) : (
          renderTabContent()
        )}
      </main>

      {/* Responsive Bottom Navigation Bar Block (Mobile size, Tablet uses top) */}
      {isProtectedShellVisible && !addingRecipe && !editingRecipe && (
        <nav className="fixed bottom-0 left-0 w-full z-45 flex justify-around items-center px-4 pb-4 pt-3 bg-surface/90 backdrop-blur-md rounded-t-2xl shadow-[0_-4px_24px_rgba(62,86,65,0.08)] md:hidden border-t border-surface-container-high transition-transform">
          <button
            onClick={() => {
              setSelectedHomeCategory(null);
              setIsFavoritesFilterActive(false);
              handleRootNavigate('home');
            }}
            className={`flex flex-col items-center justify-center py-1 transition-all flex-1 ${
              activeTab === 'home' ? 'text-primary font-black scale-103' : 'text-outline hover:text-primary'
            }`}
          >
            <Home className={`w-5 h-5 ${activeTab === 'home' ? 'stroke-[2.5px]' : ''}`} />
            <span className="font-sans font-semibold text-[10px] mt-1.5 uppercase tracking-wide">Home</span>
          </button>

          <button
            onClick={() => handleRootNavigate('search')}
            className={`flex flex-col items-center justify-center py-1 transition-all flex-1 ${
              activeTab === 'search' ? 'text-primary font-black scale-103' : 'text-outline hover:text-primary'
            }`}
          >
            <Search className={`w-5 h-5 ${activeTab === 'search' ? 'stroke-[2.5px]' : ''}`} />
            <span className="font-sans font-semibold text-[10px] mt-1.5 uppercase tracking-wide font-bold">Search</span>
          </button>
        </nav>
      )}

      {/* Persistent Desktop & Mobile Contextual floating Add Button (FAB) (Matches screenshot button!) */}
      {isProtectedShellVisible && !addingRecipe && !editingRecipe && (
        <button
          onClick={() => setAddingRecipe(true)}
          id="persistent-fab-add-recipe"
          className="fixed bottom-24 right-6 md:bottom-8 md:right-8 w-14 h-14 bg-primary text-on-primary hover:bg-primary-container rounded-full shadow-lg shadow-primary/25 flex items-center justify-center active:scale-95 hover:scale-105 transition-all z-40 outline-none"
          title="Write a new heirloom recipe"
        >
          <Plus className="w-7 h-7 text-white" />
        </button>
      )}

      {/* Recipe Drawer Detail Overlay */}
      <AnimatePresence>
        {selectedRecipe && (
          <RecipeDetailModal
            recipe={selectedRecipe}
            onClose={() => setSelectedRecipe(null)}
            onEdit={handleStartEditRecipe}
            onDuplicate={handleDuplicateRecipe}
            onShare={handleShareRecipe}
            onDelete={handleDeleteRecipe}
            onToggleFavorite={handleToggleFavorite}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
