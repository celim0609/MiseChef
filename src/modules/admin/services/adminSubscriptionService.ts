import { aiUsageService } from '../../../services/aiUsageService';
import { normalizeSubscriptionPlan, subscriptionService } from '../../../services/subscriptionService';
import type { BillingCycle, SubscriptionPlan, SubscriptionStatus } from '../../../types';
import { adminCompanyService } from './adminCompanyService';

export interface AdminSubscriptionRecord {
  companyId: string;
  companyName: string;
  ownerName: string;
  ownerEmail: string;
  currentPlan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  billingCycle: BillingCycle;
  subscriptionStartedAt: string;
  renewalDate: string;
  aiRequestsThisMonth: number;
  aiCostThisMonth: number;
  totalMembers: number;
  totalRecipes: number;
  totalInvoices: number;
}

export interface AdminSubscriptionSummary {
  totalCompanies: number;
  free: number;
  starter: number;
  professional: number;
  business: number;
  enterprise: number;
}

export interface AdminSubscriptionDashboard {
  records: AdminSubscriptionRecord[];
  summary: AdminSubscriptionSummary;
}

const normalizeSubscriptionStatus = (status: string): SubscriptionStatus => {
  if (status === 'trialing') return 'trialing';
  if (status === 'past_due') return 'past_due';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'suspended') return 'suspended';
  return 'active';
};

const normalizeBillingCycle = (billingCycle: string): BillingCycle => billingCycle === 'yearly' ? 'yearly' : 'monthly';

const isSameMonth = (value: string, date = new Date()) => {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime())
    && parsed.getFullYear() === date.getFullYear()
    && parsed.getMonth() === date.getMonth();
};

const countPlans = (records: AdminSubscriptionRecord[]): AdminSubscriptionSummary => ({
  totalCompanies: records.length,
  free: records.filter(record => record.currentPlan === 'free').length,
  starter: records.filter(record => record.currentPlan === 'starter').length,
  professional: records.filter(record => record.currentPlan === 'professional').length,
  business: records.filter(record => record.currentPlan === 'business').length,
  enterprise: records.filter(record => record.currentPlan === 'enterprise').length
});

export const adminSubscriptionService = {
  async getDashboard(): Promise<AdminSubscriptionDashboard> {
    const [companies, aiUsage] = await Promise.all([
      adminCompanyService.listCompanies(),
      aiUsageService.listUsage()
    ]);

    const monthlyUsageByCompany = new Map<string, { requests: number; cost: number }>();
    aiUsage.filter(record => isSameMonth(record.createdAt)).forEach(record => {
      const current = monthlyUsageByCompany.get(record.companyId) || { requests: 0, cost: 0 };
      monthlyUsageByCompany.set(record.companyId, {
        requests: current.requests + 1,
        cost: current.cost + record.estimatedCostUSD
      });
    });

    const subscriptions = await Promise.all(
      companies.map(company => subscriptionService.getCompanySubscription(company.companyId))
    );
    const subscriptionByCompanyId = new Map(subscriptions.map(subscription => [subscription.companyId, subscription]));

    const records = companies.map(company => {
      const subscription = subscriptionByCompanyId.get(company.companyId);
      const monthlyUsage = monthlyUsageByCompany.get(company.companyId) || { requests: 0, cost: 0 };

      return {
        companyId: company.companyId,
        companyName: company.name,
        ownerName: company.ownerName,
        ownerEmail: company.ownerEmail,
        currentPlan: subscription?.subscriptionPlan || normalizeSubscriptionPlan(company.subscriptionPlan),
        subscriptionStatus: subscription?.subscriptionStatus || normalizeSubscriptionStatus(company.subscriptionStatus),
        billingCycle: subscription?.billingCycle || normalizeBillingCycle(company.billingCycle),
        subscriptionStartedAt: subscription?.subscriptionStartedAt || company.subscriptionStartedAt,
        renewalDate: subscription?.subscriptionRenewalAt || company.subscriptionRenewalAt,
        aiRequestsThisMonth: monthlyUsage.requests,
        aiCostThisMonth: monthlyUsage.cost,
        totalMembers: company.totalMembers,
        totalRecipes: company.recipeCount,
        totalInvoices: company.invoiceCount
      } satisfies AdminSubscriptionRecord;
    }).sort((a, b) => a.companyName.localeCompare(b.companyName));

    return {
      records,
      summary: countPlans(records)
    };
  }
};
