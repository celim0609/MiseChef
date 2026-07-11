import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../firebase';
import { aiUsageService } from '../../../services/aiUsageService';
import { auditLogService } from '../../../services/auditLogService';
import { subscriptionService } from '../../../services/subscriptionService';
import { adminCompanyService } from './adminCompanyService';
import { adminUserService } from './adminUserService';
import type { AdminAlert, AdminOverviewSummary, AdminRecentActivityItem, AdminRecentAiRequest } from '../types';

const readString = (value: unknown, fallback = '') => typeof value === 'string' && value.trim() ? value.trim() : fallback;

const toTime = (value: string) => {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const getDocumentCompanyId = (data: Record<string, unknown>) => readString(data.companyId) || readString(data.workspaceId) || readString(data.createdBy) || readString(data.userId);

const getRecentItems = (items: AdminRecentActivityItem[], limit = 5) => [...items]
  .sort((a, b) => toTime(b.timestamp) - toTime(a.timestamp))
  .slice(0, limit);

const buildAlerts = ({
  companies,
  todayAiRequests,
  failedAiRequests
}: {
  companies: Awaited<ReturnType<typeof adminCompanyService.listCompanies>>;
  todayAiRequests: number;
  failedAiRequests: number;
}) => {
  const alerts: AdminAlert[] = [];
  const missingSubscriptionCount = companies.filter(company => !company.subscriptionPlan || !company.subscriptionStatus).length;
  const missingOwnerCount = companies.filter(company => !company.ownerId || company.ownerEmail === 'No email').length;

  if (todayAiRequests >= 100) {
    alerts.push({
      id: 'high-ai-usage',
      severity: 'warning',
      title: 'High AI usage',
      description: `${todayAiRequests} AI requests were recorded today.`
    });
  }

  if (missingSubscriptionCount > 0) {
    alerts.push({
      id: 'missing-subscription',
      severity: 'warning',
      title: 'Missing subscription data',
      description: `${missingSubscriptionCount} company record${missingSubscriptionCount === 1 ? '' : 's'} need subscription defaults.`
    });
  }

  if (missingOwnerCount > 0) {
    alerts.push({
      id: 'company-without-owner',
      severity: 'critical',
      title: 'Company without owner',
      description: `${missingOwnerCount} compan${missingOwnerCount === 1 ? 'y is' : 'ies are'} missing a valid owner profile.`
    });
  }

  if (failedAiRequests > 0) {
    alerts.push({
      id: 'ai-request-failures',
      severity: 'warning',
      title: 'AI request failures',
      description: `${failedAiRequests} failed AI request${failedAiRequests === 1 ? '' : 's'} detected this month.`
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: 'all-clear',
      severity: 'info',
      title: 'No platform alerts',
      description: 'No high AI usage, missing subscriptions, owner gaps, or AI failures were detected.'
    });
  }

  return alerts;
};

export const adminOverviewService = {
  async getOverview(): Promise<AdminOverviewSummary> {
    if (!db) {
      return {
        totalUsers: 0,
        totalCompanies: 0,
        activeSubscriptions: 0,
        freeCompanies: 0,
        paidCompanies: 0,
        todayAiRequests: 0,
        todayAiCost: 0,
        monthAiCost: 0,
        totalRecipes: 0,
        totalInvoices: 0,
        recentUsers: [],
        recentCompanies: [],
        recentAuditLogs: [],
        recentAiRequests: [],
        alerts: []
      };
    }

    const [users, companies, recipesSnapshot, invoicesSnapshot, aiSummary, recentAuditLogs] = await Promise.all([
      adminUserService.listUsers(),
      adminCompanyService.listCompanies(),
      getDocs(collection(db, 'recipes')).catch(() => null),
      getDocs(collection(db, 'invoices')).catch(() => null),
      aiUsageService.getUsageSummary(),
      auditLogService.listRecent(5).catch(() => [])
    ]);

    const companySubscriptions = await Promise.all(companies.map(company => subscriptionService.getCompanySubscription(company.companyId)));
    const recentAiRequests = aiSummary.recentRequests.map(request => ({
      id: request.id,
      title: request.feature,
      subtitle: [request.provider, request.model].filter(Boolean).join(' · ') || request.companyId,
      timestamp: request.createdAt,
      feature: request.feature,
      status: request.status,
      estimatedCostUSD: request.estimatedCostUSD
    } satisfies AdminRecentAiRequest));

    const recentUsers = getRecentItems(users.map(user => ({
      id: user.id,
      title: user.name,
      subtitle: user.email,
      timestamp: user.createdAt
    })));

    const recentCompanies = getRecentItems(companies.map(company => ({
      id: company.companyId,
      title: company.name,
      subtitle: company.ownerEmail,
      timestamp: company.createdAt
    })));

    const recentAuditActivity = getRecentItems(recentAuditLogs.map(log => ({
      id: log.id,
      title: log.action,
      subtitle: log.description || `${log.module} · ${log.resourceType}`,
      timestamp: String(log.timestamp || '')
    })));

    return {
      totalUsers: users.length,
      totalCompanies: companies.length,
      activeSubscriptions: companySubscriptions.filter(subscription => subscription.subscriptionStatus === 'active').length,
      freeCompanies: companySubscriptions.filter(subscription => subscription.subscriptionPlan === 'free').length,
      paidCompanies: companySubscriptions.filter(subscription => subscription.subscriptionPlan !== 'free' && subscription.subscriptionStatus === 'active').length,
      todayAiRequests: aiSummary.todayRequests,
      todayAiCost: aiSummary.todayCost,
      monthAiCost: aiSummary.monthCost,
      totalRecipes: recipesSnapshot?.docs.filter(recipeDoc => getDocumentCompanyId(recipeDoc.data() as Record<string, unknown>)).length || 0,
      totalInvoices: invoicesSnapshot?.docs.filter(invoiceDoc => getDocumentCompanyId(invoiceDoc.data() as Record<string, unknown>)).length || 0,
      recentUsers,
      recentCompanies,
      recentAuditLogs: recentAuditActivity,
      recentAiRequests: getRecentItems(recentAiRequests, 5) as AdminRecentAiRequest[],
      alerts: buildAlerts({ companies, todayAiRequests: aiSummary.todayRequests, failedAiRequests: aiSummary.monthFailures })
    };
  }
};
