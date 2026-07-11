import type { AiUsageRecord } from '../../../services/aiUsageService';
import { aiUsageService } from '../../../services/aiUsageService';
import { getPlanLimits, normalizeSubscriptionPlan, UNLIMITED_PLAN_LIMIT } from '../../../services/subscriptionPlans';
import type { SubscriptionPlan } from '../../../types';
import { adminCompanyService } from './adminCompanyService';
import { adminUserService } from './adminUserService';

export type AdminAiUsageDateFilter = 'today' | 'last7Days' | 'thisMonth' | 'last30Days';
export type AdminAiQuotaStatus = 'Normal' | 'Near Limit' | 'Limit Reached';

export interface AdminAiUsageCompanyRow {
  companyId: string;
  companyName: string;
  requests: number;
  totalTokens: number;
  estimatedCostUSD: number;
  lastAiRequest: string;
  percentageOfTotalCost: number;
}

export interface AdminAiUsageCompanyQuotaRow {
  companyId: string;
  companyName: string;
  plan: SubscriptionPlan;
  todayRequests: number;
  monthRequests: number;
  monthTokens: number;
  monthCost: number;
  requestLimit: number;
  tokenLimit: number;
  costBudgetUSD: number;
  remainingAiAllowance: number;
  usagePercentage: number;
  status: AdminAiQuotaStatus;
}

export interface AdminAiUsageUserRow {
  userId: string;
  userName: string;
  companyName: string;
  requests: number;
  totalTokens: number;
  estimatedCostUSD: number;
}

export interface AdminAiUsageBreakdownRow {
  label: string;
  requests: number;
  totalTokens: number;
  estimatedCostUSD: number;
}

export interface AdminAiUsageAlert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
}

export interface AdminAiUsageDashboard {
  filter: AdminAiUsageDateFilter;
  summary: {
    todayRequests: number;
    monthRequests: number;
    todayCost: number;
    monthCost: number;
    averageCostPerRequest: number;
    averageResponseTime: number;
  };
  topCompanies: AdminAiUsageCompanyRow[];
  companyQuotas: AdminAiUsageCompanyQuotaRow[];
  topUsers: AdminAiUsageUserRow[];
  modelBreakdown: AdminAiUsageBreakdownRow[];
  featureBreakdown: AdminAiUsageBreakdownRow[];
  alerts: AdminAiUsageAlert[];
  recordCount: number;
}

const HIGH_USER_COST_MULTIPLIER = 3;
const MIN_HIGH_USER_COST_USD = 10;
const NEAR_LIMIT_PERCENTAGE = 80;
const LIMIT_REACHED_PERCENTAGE = 100;
const USAGE_SPIKE_MULTIPLIER = 2;
const MIN_SPIKE_REQUESTS = 5;

const toTime = (value: string) => {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const startOfThisMonth = () => {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
};

const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
};

const getFilterStartDate = (filter: AdminAiUsageDateFilter) => {
  switch (filter) {
    case 'today':
      return startOfToday();
    case 'last7Days':
      return daysAgo(6);
    case 'last30Days':
      return daysAgo(29);
    case 'thisMonth':
    default:
      return startOfThisMonth();
  }
};

const isOnOrAfter = (record: AiUsageRecord, date: Date) => toTime(record.createdAt) >= date.getTime();
const sumCost = (records: AiUsageRecord[]) => records.reduce((sum, record) => sum + record.estimatedCostUSD, 0);
const sumTokens = (records: AiUsageRecord[]) => records.reduce((sum, record) => sum + record.totalTokens, 0);
const sumResponseTime = (records: AiUsageRecord[]) => records.reduce((sum, record) => sum + record.responseTime, 0);

const readLatestTimestamp = (records: AiUsageRecord[]) => records
  .map(record => record.createdAt)
  .sort((a, b) => toTime(b) - toTime(a))[0] || '';

const normalizeLabel = (value: string, fallback: string) => {
  const label = value.trim();
  if (!label) return fallback;
  return label
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, letter => letter.toUpperCase());
};

const resolveModelLabel = (record: AiUsageRecord) => {
  const model = record.model.trim();
  const feature = record.feature.toLowerCase();
  const provider = record.provider.trim();

  if (model) return model.toUpperCase().includes('GPT') ? model.toUpperCase() : model;
  if (feature.includes('ocr')) return 'OCR';
  if (provider) return normalizeLabel(provider, 'Future Provider');
  return 'Future Providers';
};

const resolveFeatureLabel = (feature: string) => {
  const normalized = feature.toLowerCase();
  if (normalized.includes('recipe')) return 'Recipe AI';
  if (normalized.includes('ocr')) return 'OCR';
  if (normalized.includes('invoice') || normalized.includes('resume')) return 'Invoice Parsing';
  if (normalized.includes('cost')) return 'Costing AI';
  if (normalized.includes('menu')) return 'Menu Generator';
  return 'Other';
};

const groupByCompany = (records: AiUsageRecord[]) => {
  const grouped = new Map<string, AiUsageRecord[]>();
  records.forEach(record => grouped.set(record.companyId, [...(grouped.get(record.companyId) || []), record]));
  return grouped;
};

const calculateUsagePercentage = (used: number, limit: number) => {
  if (limit === UNLIMITED_PLAN_LIMIT) return 0;
  if (limit <= 0) return used > 0 ? LIMIT_REACHED_PERCENTAGE : 0;
  return used / limit * 100;
};

const calculateHighestUsagePercentage = ({
  monthRequests,
  monthTokens,
  monthCost,
  requestLimit,
  tokenLimit,
  costBudgetUSD
}: {
  monthRequests: number;
  monthTokens: number;
  monthCost: number;
  requestLimit: number;
  tokenLimit: number;
  costBudgetUSD: number;
}) => Math.max(
  calculateUsagePercentage(monthRequests, requestLimit),
  calculateUsagePercentage(monthTokens, tokenLimit),
  calculateUsagePercentage(monthCost, costBudgetUSD)
);

const resolveQuotaStatus = (usagePercentage: number): AdminAiQuotaStatus => {
  if (usagePercentage >= LIMIT_REACHED_PERCENTAGE) return 'Limit Reached';
  if (usagePercentage >= NEAR_LIMIT_PERCENTAGE) return 'Near Limit';
  return 'Normal';
};

const formatLimit = (limit: number) => limit === UNLIMITED_PLAN_LIMIT ? 'Unlimited' : new Intl.NumberFormat().format(limit);
const formatMoney = (value: number) => `$${value.toFixed(4)}`;

const buildCompanyRows = (
  records: AiUsageRecord[],
  companyNames: Map<string, string>,
  totalCost: number
): AdminAiUsageCompanyRow[] => [...groupByCompany(records).entries()]
  .map(([companyId, groupRecords]) => {
    const estimatedCostUSD = sumCost(groupRecords);
    return {
      companyId,
      companyName: companyNames.get(companyId) || companyId || 'Unknown Company',
      requests: groupRecords.length,
      totalTokens: sumTokens(groupRecords),
      estimatedCostUSD,
      lastAiRequest: readLatestTimestamp(groupRecords),
      percentageOfTotalCost: totalCost > 0 ? estimatedCostUSD / totalCost * 100 : 0
    };
  })
  .sort((a, b) => b.estimatedCostUSD - a.estimatedCostUSD);

const buildCompanyQuotaRows = ({
  companies,
  todayRecords,
  monthRecords
}: {
  companies: Awaited<ReturnType<typeof adminCompanyService.listCompanies>>;
  todayRecords: AiUsageRecord[];
  monthRecords: AiUsageRecord[];
}): AdminAiUsageCompanyQuotaRow[] => {
  const todayByCompany = groupByCompany(todayRecords);
  const monthByCompany = groupByCompany(monthRecords);

  return companies.map(company => {
    const plan = normalizeSubscriptionPlan(company.subscriptionPlan);
    const limits = getPlanLimits(plan);
    const companyTodayRecords = todayByCompany.get(company.companyId) || [];
    const companyMonthRecords = monthByCompany.get(company.companyId) || [];
    const monthRequests = companyMonthRecords.length;
    const monthTokens = sumTokens(companyMonthRecords);
    const monthCost = sumCost(companyMonthRecords);
    const usagePercentage = calculateHighestUsagePercentage({
      monthRequests,
      monthTokens,
      monthCost,
      requestLimit: limits.monthlyAiRequests,
      tokenLimit: limits.monthlyAiTokens,
      costBudgetUSD: limits.monthlyAiCostBudgetUSD
    });

    return {
      companyId: company.companyId,
      companyName: company.name,
      plan,
      todayRequests: companyTodayRecords.length,
      monthRequests,
      monthTokens,
      monthCost,
      requestLimit: limits.monthlyAiRequests,
      tokenLimit: limits.monthlyAiTokens,
      costBudgetUSD: limits.monthlyAiCostBudgetUSD,
      remainingAiAllowance: limits.monthlyAiRequests === UNLIMITED_PLAN_LIMIT ? UNLIMITED_PLAN_LIMIT : Math.max(limits.monthlyAiRequests - monthRequests, 0),
      usagePercentage,
      status: resolveQuotaStatus(usagePercentage)
    };
  }).sort((a, b) => b.usagePercentage - a.usagePercentage || b.monthCost - a.monthCost);
};

const buildUserRows = (
  records: AiUsageRecord[],
  userNames: Map<string, string>,
  userCompanyNames: Map<string, string>,
  companyNames: Map<string, string>
): AdminAiUsageUserRow[] => {
  const grouped = new Map<string, AiUsageRecord[]>();
  records.forEach(record => grouped.set(record.userId, [...(grouped.get(record.userId) || []), record]));

  return [...grouped.entries()]
    .map(([userId, groupRecords]) => {
      const latestCompanyId = [...groupRecords].sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt))[0]?.companyId || '';
      return {
        userId,
        userName: userNames.get(userId) || userId || 'Unknown User',
        companyName: userCompanyNames.get(userId) || companyNames.get(latestCompanyId) || latestCompanyId || 'Unknown Company',
        requests: groupRecords.length,
        totalTokens: sumTokens(groupRecords),
        estimatedCostUSD: sumCost(groupRecords)
      };
    })
    .sort((a, b) => b.estimatedCostUSD - a.estimatedCostUSD);
};

const groupRecords = (records: AiUsageRecord[], getKey: (record: AiUsageRecord) => string): AdminAiUsageBreakdownRow[] => {
  const grouped = new Map<string, AiUsageRecord[]>();
  records.forEach(record => {
    const key = getKey(record);
    grouped.set(key, [...(grouped.get(key) || []), record]);
  });

  return [...grouped.entries()]
    .map(([label, groupRecords]) => ({
      label,
      requests: groupRecords.length,
      totalTokens: sumTokens(groupRecords),
      estimatedCostUSD: sumCost(groupRecords)
    }))
    .sort((a, b) => b.estimatedCostUSD - a.estimatedCostUSD);
};

const buildAlerts = ({
  monthRecords,
  topUsers,
  companyQuotas
}: {
  monthRecords: AiUsageRecord[];
  topUsers: AdminAiUsageUserRow[];
  companyQuotas: AdminAiUsageCompanyQuotaRow[];
}) => {
  const alerts: AdminAiUsageAlert[] = [];
  const monthByCompany = groupByCompany(monthRecords);

  companyQuotas.forEach(company => {
    if (company.usagePercentage >= LIMIT_REACHED_PERCENTAGE) {
      alerts.push({
        id: `limit-reached-${company.companyId}`,
        severity: 'critical',
        title: 'Company AI limit reached',
        description: `${company.companyName} is at ${company.usagePercentage.toFixed(1)}% of its ${company.plan} AI allowance.`
      });
    } else if (company.usagePercentage >= NEAR_LIMIT_PERCENTAGE) {
      alerts.push({
        id: `near-limit-${company.companyId}`,
        severity: 'warning',
        title: 'Company near AI allowance',
        description: `${company.companyName} has used ${company.usagePercentage.toFixed(1)}% of its ${company.plan} AI allowance.`
      });
    }

    if (company.costBudgetUSD !== UNLIMITED_PLAN_LIMIT && company.monthCost > company.costBudgetUSD) {
      alerts.push({
        id: `cost-budget-${company.companyId}`,
        severity: 'critical',
        title: 'Company AI cost budget exceeded',
        description: `${company.companyName} has spent ${formatMoney(company.monthCost)} against a ${formatMoney(company.costBudgetUSD)} monthly AI budget.`
      });
    }

    const companyMonthRecords = monthByCompany.get(company.companyId) || [];
    const daysElapsed = Math.max(new Date().getDate(), 1);
    const previousAverageDailyRequests = Math.max((companyMonthRecords.length - company.todayRequests) / Math.max(daysElapsed - 1, 1), 0);
    if (company.todayRequests >= MIN_SPIKE_REQUESTS && previousAverageDailyRequests > 0 && company.todayRequests >= previousAverageDailyRequests * USAGE_SPIKE_MULTIPLIER) {
      alerts.push({
        id: `usage-spike-${company.companyId}`,
        severity: 'warning',
        title: 'Unusual AI usage spike',
        description: `${company.companyName} has ${company.todayRequests} AI requests today, above its recent daily average of ${previousAverageDailyRequests.toFixed(1)}.`
      });
    }
  });

  const averageUserCost = topUsers.length > 0 ? topUsers.reduce((sum, user) => sum + user.estimatedCostUSD, 0) / topUsers.length : 0;
  const highCostThreshold = Math.max(MIN_HIGH_USER_COST_USD, averageUserCost * HIGH_USER_COST_MULTIPLIER);
  topUsers.filter(user => user.estimatedCostUSD >= highCostThreshold).slice(0, 3).forEach(user => {
    alerts.push({
      id: `high-user-cost-${user.userId}`,
      severity: 'warning',
      title: 'Unusually high user AI cost',
      description: `${user.userName} generated ${formatMoney(user.estimatedCostUSD)} in AI cost for the selected period.`
    });
  });

  const failureCount = monthRecords.filter(record => record.status !== 'success').length;
  if (failureCount >= 3 && monthRecords.length > 0 && failureCount / monthRecords.length >= 0.1) {
    alerts.push({
      id: 'ai-failures-increased',
      severity: 'warning',
      title: 'AI request failures increased',
      description: `${failureCount} AI requests failed this month.`
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: 'ai-usage-normal',
      severity: 'info',
      title: 'AI usage looks normal',
      description: 'No allowance, cost budget, usage spike, high-user, or failure alerts were detected.'
    });
  }

  return alerts;
};

export const adminAiUsageService = {
  async getDashboard(filter: AdminAiUsageDateFilter): Promise<AdminAiUsageDashboard> {
    const [usage, companies, users] = await Promise.all([
      aiUsageService.listUsage(),
      adminCompanyService.listCompanies(),
      adminUserService.listUsers()
    ]);

    const companyNames = new Map(companies.map(company => [company.companyId, company.name]));
    const userNames = new Map(users.map(user => [user.id, user.name]));
    const userCompanyNames = new Map(users.map(user => [user.id, user.company]));

    const todayRecords = usage.filter(record => isOnOrAfter(record, startOfToday()));
    const monthRecords = usage.filter(record => isOnOrAfter(record, startOfThisMonth()));
    const filteredRecords = usage.filter(record => isOnOrAfter(record, getFilterStartDate(filter)));
    const filteredCost = sumCost(filteredRecords);
    const topCompanies = buildCompanyRows(filteredRecords, companyNames, filteredCost);
    const topUsers = buildUserRows(filteredRecords, userNames, userCompanyNames, companyNames);
    const companyQuotas = buildCompanyQuotaRows({ companies, todayRecords, monthRecords });

    return {
      filter,
      summary: {
        todayRequests: todayRecords.length,
        monthRequests: monthRecords.length,
        todayCost: sumCost(todayRecords),
        monthCost: sumCost(monthRecords),
        averageCostPerRequest: filteredRecords.length > 0 ? filteredCost / filteredRecords.length : 0,
        averageResponseTime: filteredRecords.length > 0 ? sumResponseTime(filteredRecords) / filteredRecords.length : 0
      },
      topCompanies,
      companyQuotas,
      topUsers,
      modelBreakdown: groupRecords(filteredRecords, resolveModelLabel),
      featureBreakdown: groupRecords(filteredRecords, record => resolveFeatureLabel(record.feature)),
      alerts: buildAlerts({ monthRecords, topUsers, companyQuotas }),
      recordCount: filteredRecords.length
    };
  },

  formatLimit
};
