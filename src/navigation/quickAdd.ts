import type { RootTab, WorkspaceMemberRole } from '../types';

export type QuickAddActionId = 'invoice' | 'recipe' | 'ingredient' | 'supplier';

export interface QuickAddActionDefinition {
  id: QuickAddActionId;
  label: string;
  subtitle: string;
  targetTab: RootTab;
}

export interface QuickAddRequest {
  action: QuickAddActionId;
  requestId: number;
}

const RECIPE_ROLES: WorkspaceMemberRole[] = ['Owner', 'Manager', 'Head Chef', 'Sous Chef', 'Chef'];
const PURCHASING_ROLES: WorkspaceMemberRole[] = ['Owner', 'Manager', 'Head Chef', 'Purchasing'];

export const QUICK_ADD_ACTIONS: QuickAddActionDefinition[] = [
  { id: 'invoice', label: 'Add Invoice', subtitle: 'Upload supplier invoice', targetTab: 'costingInvoices' },
  { id: 'recipe', label: 'Add Recipe', subtitle: 'Create a new recipe', targetTab: 'search' },
  { id: 'ingredient', label: 'Add Ingredient', subtitle: 'Add to ingredient library', targetTab: 'costingIngredients' },
  { id: 'supplier', label: 'Add Supplier', subtitle: 'Create supplier record', targetTab: 'businessSuppliers' }
];

export const canPerformQuickAdd = (
  action: QuickAddActionId,
  role?: WorkspaceMemberRole | null,
  isSuperAdmin = false
) => {
  if (isSuperAdmin) return true;
  if (!role) return false;
  return action === 'recipe' ? RECIPE_ROLES.includes(role) : PURCHASING_ROLES.includes(role);
};

export const getAvailableQuickAddActions = (
  role?: WorkspaceMemberRole | null,
  isSuperAdmin = false
) => QUICK_ADD_ACTIONS.filter(action => canPerformQuickAdd(action.id, role, isSuperAdmin));

export const getQuickAddAction = (actionId: QuickAddActionId) => (
  QUICK_ADD_ACTIONS.find(action => action.id === actionId)
);
