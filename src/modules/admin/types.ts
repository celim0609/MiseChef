export interface AdminUserRecord {
  id: string;
  companyId?: string;
  name: string;
  email: string;
  role: string;
  companyRole?: string;
  company: string;
  createdAt: string;
  lastLoginAt: string;
  subscriptionPlan: string;
}

export interface AdminCompanyRecord {
  companyId: string;
  name: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  subscriptionPlan: string;
  subscriptionStatus: string;
  billingCycle: string;
  subscriptionStartedAt: string;
  subscriptionRenewalAt: string;
  subscriptionCancelledAt: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  totalMembers: number;
  recipeCount: number;
  invoiceCount: number;
  supplierCount: number;
  aiRequestCount: number;
  members: AdminCompanyMemberRecord[];
}

export interface AdminCompanyMemberRecord {
  id: string;
  name: string;
  role: string;
  email: string;
}

export interface AdminOverviewSummary {
  totalUsers: number;
  totalCompanies: number;
  activeSubscriptions: number;
  freeCompanies: number;
  paidCompanies: number;
  todayAiRequests: number;
  todayAiCost: number;
  monthAiCost: number;
  totalRecipes: number;
  totalInvoices: number;
  recentUsers: AdminRecentActivityItem[];
  recentCompanies: AdminRecentActivityItem[];
  recentAuditLogs: AdminRecentActivityItem[];
  recentAiRequests: AdminRecentAiRequest[];
  alerts: AdminAlert[];
}

export interface AdminRecentActivityItem {
  id: string;
  title: string;
  subtitle: string;
  timestamp: string;
}

export interface AdminRecentAiRequest extends AdminRecentActivityItem {
  feature: string;
  status: string;
  estimatedCostUSD: number;
}

export interface AdminAlert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
}
