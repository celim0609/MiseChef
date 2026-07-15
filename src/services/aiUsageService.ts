import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase';

export interface AiUsageRecord {
  id: string;
  userId: string;
  companyId: string;
  feature: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUSD: number;
  responseTime: number;
  status: string;
  createdAt: string;
}

export interface AiUsageSummary {
  todayRequests: number;
  todayCost: number;
  monthCost: number;
  monthFailures: number;
  recentRequests: AiUsageRecord[];
}

const readString = (value: unknown, fallback = '') => typeof value === 'string' && value.trim() ? value.trim() : fallback;
const readNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0;

const readTimestamp = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  return '';
};

const toTime = (value: string) => {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const isSameDay = (value: string, date = new Date()) => {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime())
    && parsed.getFullYear() === date.getFullYear()
    && parsed.getMonth() === date.getMonth()
    && parsed.getDate() === date.getDate();
};

const isSameMonth = (value: string, date = new Date()) => {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime())
    && parsed.getFullYear() === date.getFullYear()
    && parsed.getMonth() === date.getMonth();
};

const normalizeAiUsageRecord = (id: string, data: Record<string, unknown>): AiUsageRecord => {
  const promptTokens = readNumber(data.promptTokens);
  const completionTokens = readNumber(data.completionTokens);
  const storedTotalTokens = readNumber(data.totalTokens);

  return {
    id,
    userId: readString(data.userId, 'unknown'),
    companyId: readString(data.companyId, 'unknown'),
    feature: readString(data.feature, 'AI Request'),
    provider: readString(data.provider),
    model: readString(data.model),
    promptTokens,
    completionTokens,
    totalTokens: storedTotalTokens || promptTokens + completionTokens,
    estimatedCostUSD: readNumber(data.estimatedCostUSD),
    responseTime: readNumber(data.responseTime),
    status: readString(data.status, 'unknown'),
    createdAt: readTimestamp(data.createdAt) || readTimestamp(data.timestamp)
  };
};

export const aiUsageService = {
  async listWorkspaceUsage(companyId: string): Promise<AiUsageRecord[]> {
    if (!db || !companyId) return [];

    const usageQuery = query(collection(db, 'ai_usage'), where('companyId', '==', companyId));
    const snapshot = await getDocs(usageQuery);
    return snapshot.docs.map(docSnapshot => normalizeAiUsageRecord(docSnapshot.id, docSnapshot.data() as Record<string, unknown>));
  },

  async listUsage(): Promise<AiUsageRecord[]> {
    if (!db) return [];

    const snapshot = await getDocs(collection(db, 'ai_usage'));
    return snapshot.docs.map(docSnapshot => normalizeAiUsageRecord(docSnapshot.id, docSnapshot.data() as Record<string, unknown>));
  },

  async listRecentUsage(maxRecords = 5): Promise<AiUsageRecord[]> {
    if (!db) return [];

    try {
      const usageQuery = query(collection(db, 'ai_usage'), orderBy('createdAt', 'desc'), limit(maxRecords));
      const snapshot = await getDocs(usageQuery);
      return snapshot.docs.map(docSnapshot => normalizeAiUsageRecord(docSnapshot.id, docSnapshot.data() as Record<string, unknown>));
    } catch (err) {
      const usage = await this.listUsage();
      return usage.sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt)).slice(0, maxRecords);
    }
  },

  async getUsageSummary(): Promise<AiUsageSummary> {
    const usage = await this.listUsage();
    const recentRequests = [...usage].sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt)).slice(0, 5);

    return {
      todayRequests: usage.filter(item => isSameDay(item.createdAt)).length,
      todayCost: usage.filter(item => isSameDay(item.createdAt)).reduce((sum, item) => sum + item.estimatedCostUSD, 0),
      monthCost: usage.filter(item => isSameMonth(item.createdAt)).reduce((sum, item) => sum + item.estimatedCostUSD, 0),
      monthFailures: usage.filter(item => isSameMonth(item.createdAt) && item.status !== 'success').length,
      recentRequests
    };
  }
};
