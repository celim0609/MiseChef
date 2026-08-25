import type { RootTab, WorkspaceMemberRole } from '../../types';

export const TEAM_ROLE_ORDER: WorkspaceMemberRole[] = [
  'Owner',
  'Manager',
  'Head Chef',
  'Sous Chef',
  'Chef',
  'Purchasing',
  'Finance',
  'Viewer'
];

export const TEAM_ROLE_DESCRIPTIONS: Record<WorkspaceMemberRole, string> = {
  Owner: 'Full workspace ownership, settings, billing, and team control.',
  Manager: 'Restaurant operations, purchasing, invoices, suppliers, and team management.',
  'Head Chef': 'Same access as Manager for kitchen leadership and operations.',
  'Sous Chef': 'Recipe workspace access for kitchen production.',
  Chef: 'Recipe workspace access for kitchen production.',
  Purchasing: 'Invoice and supplier purchasing workflows.',
  Finance: 'Business sales and reporting visibility.',
  Viewer: 'Read-only portfolio and limited workspace visibility.'
};

const MANAGER_LEVEL_ROLES: WorkspaceMemberRole[] = ['Owner', 'Manager', 'Head Chef'];
const INVOICE_ROLES: WorkspaceMemberRole[] = ['Owner', 'Manager', 'Head Chef', 'Purchasing'];
const SUPPLIER_ROLES: WorkspaceMemberRole[] = ['Owner', 'Manager', 'Head Chef', 'Purchasing'];
const BUSINESS_ROLES: WorkspaceMemberRole[] = ['Owner', 'Manager', 'Head Chef', 'Finance'];
export interface StorePermissions {
  viewStore: boolean;
  viewOrders: boolean;
  processOrders: boolean;
  manageProducts: boolean;
  manageAvailability: boolean;
  manageStoreSettings: boolean;
  managePaymentSettings: boolean;
  refundFinancialActions: boolean;
  manageHostGroupOrders: boolean;
}

const STORE_VIEW_ROLES = new Set<WorkspaceMemberRole>(TEAM_ROLE_ORDER);
const STORE_ORDER_VIEW_ROLES = new Set<WorkspaceMemberRole>(['Owner', 'Manager', 'Head Chef', 'Sous Chef', 'Chef', 'Finance']);
const STORE_ORDER_PROCESS_ROLES = new Set<WorkspaceMemberRole>(['Owner', 'Manager', 'Head Chef', 'Sous Chef', 'Chef']);
const STORE_PRODUCT_ROLES = new Set<WorkspaceMemberRole>(['Owner', 'Manager', 'Head Chef']);
const STORE_ADMIN_ROLES = new Set<WorkspaceMemberRole>(['Owner', 'Manager']);

export const getStorePermissions = (role?: WorkspaceMemberRole | null): StorePermissions => ({
  viewStore: Boolean(role && STORE_VIEW_ROLES.has(role)),
  viewOrders: Boolean(role && STORE_ORDER_VIEW_ROLES.has(role)),
  processOrders: Boolean(role && STORE_ORDER_PROCESS_ROLES.has(role)),
  manageProducts: Boolean(role && STORE_PRODUCT_ROLES.has(role)),
  manageAvailability: Boolean(role && STORE_PRODUCT_ROLES.has(role)),
  manageStoreSettings: Boolean(role && STORE_ADMIN_ROLES.has(role)),
  managePaymentSettings: Boolean(role && STORE_ADMIN_ROLES.has(role)),
  refundFinancialActions: Boolean(role && STORE_ADMIN_ROLES.has(role)),
  manageHostGroupOrders: Boolean(role && STORE_ADMIN_ROLES.has(role))
});

export const normalizeTeamRole = (role: unknown): WorkspaceMemberRole => {
  return TEAM_ROLE_ORDER.includes(role as WorkspaceMemberRole) ? role as WorkspaceMemberRole : 'Viewer';
};

export const canManageTeam = (role?: WorkspaceMemberRole | null) => Boolean(role && MANAGER_LEVEL_ROLES.includes(role));
export const canInviteMembers = (role?: WorkspaceMemberRole | null) => role === 'Owner' || role === 'Manager';
export const canManageMembers = (role?: WorkspaceMemberRole | null) => Boolean(role && MANAGER_LEVEL_ROLES.includes(role));
export const canTransferOwnership = (role?: WorkspaceMemberRole | null) => role === 'Owner';
export const canAccessSettings = (role?: WorkspaceMemberRole | null) => role === 'Owner';

export const canAccessRootTab = (tab: RootTab, role?: WorkspaceMemberRole | null, isSuperAdmin = false) => {
  if (isSuperAdmin || tab === 'admin') return isSuperAdmin;
  if (!role) return tab === 'login';

  switch (tab) {
    case 'home':
    case 'portfolio':
    case 'profile':
    case 'statistics':
    case 'favorites':
    case 'personalExpenses':
      return true;
    case 'search':
      return true;
    case 'business':
    case 'businessSales':
      return BUSINESS_ROLES.includes(role) || MANAGER_LEVEL_ROLES.includes(role);
    case 'businessSuppliers':
      return SUPPLIER_ROLES.includes(role);
    case 'store':
      return getStorePermissions(role).viewStore;
    case 'storePos':
      return getStorePermissions(role).processOrders;
    case 'costing':
    case 'costingInvoices':
    case 'costingInvoiceDetail':
      return INVOICE_ROLES.includes(role);
    case 'costingIngredients':
    case 'costingReports':
      return INVOICE_ROLES.includes(role) || role === 'Finance';
    case 'team':
      return canManageTeam(role);
    case 'billing':
      return true;
    case 'settings':
      return canAccessSettings(role);
    case 'login':
      return true;
    default:
      return false;
  }
};
