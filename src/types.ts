/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Ingredient {
  id: string;
  name: string;
  englishName?: string;
  chineseName?: string;
  ingredientId?: string;
  qty: string;
  unit: string;
  unitCost?: number;
  ingredientCost?: number;
  costingUnit?: string;
  costLastCalculatedAt?: string;
  notes?: string;
}

export interface RecipeCostBreakdownItem {
  recipeIngredientId: string;
  ingredientId?: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  unitCost: number;
  ingredientCost: number;
  percentageOfTotalRecipeCost: number;
}

export interface RecipeCosting {
  totalRecipeCost: number;
  costPerPortion: number;
  sellingPrice: number;
  foodCostPercentage: number;
  grossProfitPercentage: number;
  breakdown: RecipeCostBreakdownItem[];
  lastCalculatedAt: string;
}

export interface MethodStep {
  id: string;
  stepNumber: number;
  image?: string;
  description: string;
}

export type RecipeVisibility =
  | "private"
  | "workspace"
  | "team"
  | "organization"
  | "public"
  | "marketplace";

export interface Recipe {
  id: string;
  title: string;
  coverImage: string;
  imageUrl?: string;
  scanAttachmentUrl?: string;
  scannedImageDataUrl?: string;
  category: string;
  categories?: string[];
  prepTime: number; // in minutes
  cookTime?: number;
  servings: number;
  yield: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  story: string;
  chefNotes?: string;
  ingredients: Ingredient[];
  method: MethodStep[];
  videoLink: string;
  sellingPrice?: number;
  costing?: RecipeCosting;
  recipeCostLastCalculatedAt?: string;
  chefName: string;
  chefAvatar?: string;
  isSaved: boolean;
  collections: string[]; // collection IDs
  createdAt?: string;
  tags?: string[];
  isFeatured?: boolean;
  visibility?: RecipeVisibility;
}

export interface RecipeCategory {
  id: string;
  name: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ChefProfile {
  photo: string;
  name: string;
  jobTitle: string;
  yearsExperience: string;
  bio: string;
  quote: string;
}

export const DEFAULT_CHEF_PROFILE: ChefProfile = {
  photo: '',
  name: 'Ce Lim',
  jobTitle: 'Junior Sous Chef',
  yearsExperience: '8+',
  bio: 'Passionate chef specializing in bakery, pastry, school meals, and recipe development.',
  quote: 'Every recipe tells a story.'
};

export type UserRole = 'super_admin' | 'admin' | 'user';

export type CompanyRole = 'super_admin' | 'owner' | 'manager' | 'chef' | 'staff';

export type SubscriptionPlan = 'free' | 'starter' | 'professional' | 'business' | 'enterprise';
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'cancelled' | 'suspended';
export type BillingCycle = 'monthly' | 'yearly';

export interface Company {
  companyId: string;
  name: string;
  ownerId: string;
  subscriptionPlan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  billingCycle: BillingCycle;
  subscriptionStartedAt: string;
  subscriptionRenewalAt: string;
  subscriptionCancelledAt: string | null;
  status: 'Active' | 'Suspended' | 'Cancelled';
  createdAt: string;
  updatedAt: string;
}


export type WorkspaceType = 'real' | 'demo';
export type WorkspaceMemberRole = 'Owner' | 'Manager' | 'Head Chef' | 'Sous Chef' | 'Chef' | 'Purchasing' | 'Finance' | 'Viewer';
export type WorkspaceMemberStatus = 'Active' | 'Disabled' | 'Invited' | 'Removed';

export interface WorkspaceMemberSummary {
  userId: string;
  email: string;
  displayName: string;
  role: WorkspaceMemberRole;
  status: WorkspaceMemberStatus;
}

export interface Workspace {
  id: string;
  name: string;
  type: WorkspaceType;
  ownerId: string;
  members: WorkspaceMemberSummary[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMembership {
  id: string;
  workspaceId: string;
  userId: string;
  email: string;
  displayName: string;
  role: WorkspaceMemberRole;
  status: WorkspaceMemberStatus;
  workspaceName: string;
  workspaceType: WorkspaceType;
  createdAt: string;
  updatedAt: string;
}

export interface PlanLimits {
  aiCreditsMonthly: number;
  monthlyAiRequests: number;
  monthlyAiTokens: number;
  monthlyAiCostBudgetUSD: number;
  invoiceOcrLimit: number;
  teamMemberLimit: number;
  storageLimitMB: number;
  recipeLimit: number;
  ingredientLimit: number;
  invoiceLimit: number;
  supplierLimit: number;
  workspaceLimit: number;
  canExportPDF: boolean;
  canUseAdvancedReports: boolean;
  canUseTeamManagement: boolean;
  canUseInventory: boolean;
  canUseMultipleWorkspaces: boolean;
}

export interface KitchenDictionaryIngredient {
  chinese: string;
  english: string;
  category: string;
  aliases: string[];
}

export interface Collection {
  id: string;
  name: string;
  recipeCount: number;
  coverImage: string;
  description?: string;
}

export type RootTab =
  | 'home'
  | 'search'
  | 'favorites'
  | 'portfolio'
  | 'profile'
  | 'statistics'
  | 'settings'
  | 'billing'
  | 'login'
  | 'team'
  | 'admin'
  | 'business'
  | 'businessSales'
  | 'businessSuppliers'
  | 'costing'
  | 'costingIngredients'
  | 'costingInvoices'
  | 'costingInvoiceDetail'
  | 'costingReports';
