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
const RECIPE_ROLES: WorkspaceMemberRole[] = ['Owner', 'Manager', 'Head Chef', 'Sous Chef', 'Chef'];
const INVOICE_ROLES: WorkspaceMemberRole[] = ['Owner', 'Manager', 'Head Chef', 'Purchasing'];
const SUPPLIER_ROLES: WorkspaceMemberRole[] = ['Owner', 'Manager', 'Head Chef', 'Purchasing'];
const BUSINESS_ROLES: WorkspaceMemberRole[] = ['Owner', 'Manager', 'Head Chef', 'Finance'];

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
      return true;
    case 'search':
      return RECIPE_ROLES.includes(role);
    case 'business':
    case 'businessSales':
      return BUSINESS_ROLES.includes(role) || MANAGER_LEVEL_ROLES.includes(role);
    case 'businessSuppliers':
      return SUPPLIER_ROLES.includes(role);
    case 'costing':
    case 'costingInvoices':
    case 'costingInvoiceDetail':
      return INVOICE_ROLES.includes(role);
    case 'costingIngredients':
    case 'costingReports':
      return INVOICE_ROLES.includes(role) || role === 'Finance';
    case 'team':
      return canManageTeam(role);
    case 'settings':
      return canAccessSettings(role);
    case 'login':
      return true;
    default:
      return false;
  }
};
