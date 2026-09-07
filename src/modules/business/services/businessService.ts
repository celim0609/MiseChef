import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '../../../firebase';
import { invoiceService } from '../../costing/services';
import { storeOrderService } from '../../store/services';
import { DEFAULT_REGION_CONFIGURATION } from '../../../regions';
import { calculateBusinessAccounting, createBusinessDashboardSummary, getBusinessDashboardPeriodRange } from '../accounting';
import type { BusinessDashboardSummary, BusinessDateRange, BusinessSale } from '../types';

const removeUndefinedFields = <T,>(value: T): T => {
  if (Array.isArray(value)) return value.map(item => removeUndefinedFields(item)) as T;

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, item]) => {
      if (item !== undefined) acc[key] = removeUndefinedFields(item);
      return acc;
    }, {}) as T;
  }

  return value;
};

const normalizeSale = (sale: BusinessSale): BusinessSale => ({
  ...sale,
  amount: Number(sale.amount || 0),
  notes: sale.notes || ''
});

export const businessService = {
  async listSales(workspaceId?: string, dateRange?: { from: string; to: string }): Promise<BusinessSale[]> {
    if (!db || !workspaceId) return [];

    const constraints = [where('workspaceId', '==', workspaceId)];
    if (dateRange) {
      constraints.push(where('date', '>=', dateRange.from), where('date', '<=', dateRange.to));
    }
    const salesQuery = query(collection(db, 'businessSales'), ...constraints);
    const snapshot = await getDocs(salesQuery);

    return snapshot.docs
      .map(saleDoc => normalizeSale({ id: saleDoc.id, ...saleDoc.data() } as BusinessSale))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  },

  async createSale({ date, amount, notes }: { date: string; amount: number; notes: string }, userId: string, workspaceId = userId): Promise<BusinessSale> {
    if (!db) throw new Error("We couldn't connect to your workspace. Please refresh the page or try again.");

    const saleRef = doc(collection(db, 'businessSales'));
    const now = new Date().toISOString();
    const sale: BusinessSale = normalizeSale({
      id: saleRef.id,
      date,
      amount,
      notes,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
      workspaceId
    });

    await setDoc(saleRef, removeUndefinedFields(sale));
    return sale;
  },

  async getAccountingReport(userId?: string, workspaceId = userId, from = '', to = '', timeZone = DEFAULT_REGION_CONFIGURATION.timeZone) {
    if (!userId || !workspaceId || !from || !to || from > to) {
      return calculateBusinessAccounting({ from: '1970-01-01', to: '1970-01-01', invoices: [], manualSales: [], storeOrders: [], timeZone });
    }
    const start = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    const [manualSales, invoices, storeOrders] = await Promise.all([
      this.listSales(workspaceId, { from, to }),
      invoiceService.listInvoices(userId, { workspaceId }),
      storeOrderService.getCompletedWorkspaceOrdersForBusinessDate(workspaceId, start, end)
    ]);
    return calculateBusinessAccounting({ from, to, invoices, manualSales, storeOrders, timeZone });
  },

  async getDashboardSummary(
    userId?: string,
    workspaceId = userId,
    timeZone = DEFAULT_REGION_CONFIGURATION.timeZone,
    dateRange?: BusinessDateRange
  ): Promise<BusinessDashboardSummary> {
    if (!userId || !workspaceId) {
      return createBusinessDashboardSummary(calculateBusinessAccounting({ from: '1970-01-01', to: '1970-01-01', invoices: [], manualSales: [], storeOrders: [], timeZone }));
    }

    const range = dateRange || getBusinessDashboardPeriodRange({ period: 'this-month', now: new Date(), timeZone });
    if (!range) return createBusinessDashboardSummary(calculateBusinessAccounting({ from: '1970-01-01', to: '1970-01-01', invoices: [], manualSales: [], storeOrders: [], timeZone }));
    return createBusinessDashboardSummary(await this.getAccountingReport(userId, workspaceId, range.from, range.to, timeZone));
  }
};
