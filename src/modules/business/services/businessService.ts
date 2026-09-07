import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '../../../firebase';
import { invoiceService } from '../../costing/services';
import { storeOrderService } from '../../store/services';
import { DEFAULT_REGION_CONFIGURATION } from '../../../regions';
import {
  getBusinessDateKey
} from '../purchaseKpi';
import { calculateBusinessAccounting } from '../accounting';
import type { BusinessDashboardSummary, BusinessSale } from '../types';

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
      storeOrderService.getCompletedOrdersForBusinessDate(workspaceId, workspaceId, start, end)
    ]);
    return calculateBusinessAccounting({ from, to, invoices, manualSales, storeOrders, timeZone });
  },

  async getDashboardSummary(userId?: string, workspaceId = userId, timeZone = DEFAULT_REGION_CONFIGURATION.timeZone): Promise<BusinessDashboardSummary> {
    if (!userId || !workspaceId) {
      return {
        todaySales: 0,
        todayPurchases: 0,
        monthSales: 0,
        monthPurchases: 0,
        purchaseCostPercentage: null,
        monthlyTrend: [],
        topSuppliers: [],
        alerts: [],
        availability: { todaySales: false, todayPurchases: false, monthSales: false, monthPurchases: false, sales: false, invoices: false }
      };
    }

    const today = new Date();
    const todayKey = getBusinessDateKey(today, timeZone);
    const monthStart = `${todayKey.slice(0, 7)}-01`;
    const rangeStart = new Date(`${monthStart}T00:00:00Z`);
    const rangeEnd = new Date(`${todayKey}T00:00:00Z`);
    rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);
    const [sales, invoices, storeOrders] = await Promise.all([
      this.listSales(workspaceId, { from: monthStart, to: todayKey }),
      invoiceService.listInvoices(userId, { workspaceId }),
      storeOrderService.getCompletedOrdersForBusinessDate(workspaceId, workspaceId, rangeStart, rangeEnd)
    ]);
    const accounting = calculateBusinessAccounting({ from: monthStart, to: todayKey, invoices, manualSales: sales, storeOrders, timeZone });
    const todayAccounting = calculateBusinessAccounting({ from: todayKey, to: todayKey, invoices, manualSales: sales, storeOrders, timeZone });
    const { totalSales: monthSales, totalPurchases: monthPurchases, purchaseCostPercentage, salesTrend: monthlyTrend } = accounting;
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const hasInvoiceThisWeek = invoices.some(invoice => new Date(invoice.uploadDate) >= sevenDaysAgo);
    const alerts = [
      purchaseCostPercentage !== null && purchaseCostPercentage > 35
        ? { id: 'purchase-cost-high', severity: 'danger' as const, message: `Purchase cost is above target at ${purchaseCostPercentage.toFixed(1)}%.` }
        : purchaseCostPercentage !== null && purchaseCostPercentage > 30
          ? { id: 'purchase-cost-watch', severity: 'warning' as const, message: `Purchase cost is approaching target at ${purchaseCostPercentage.toFixed(1)}%.` }
          : null,
      (sales.length > 0 || storeOrders.length > 0) && todayAccounting.salesRecordCount === 0 ? { id: 'no-sales-today', severity: 'warning' as const, message: 'No sales recorded today.' } : null,
      invoices.length > 0 && !hasInvoiceThisWeek ? { id: 'no-invoices-week', severity: 'info' as const, message: 'No invoices uploaded this week.' } : null
    ].filter(Boolean);

    return {
      todaySales: todayAccounting.totalSales,
      todayPurchases: todayAccounting.totalPurchases,
      monthSales,
      monthPurchases,
      purchaseCostPercentage,
      monthlyTrend,
      topSuppliers: accounting.supplierSpend.slice(0, 5),
      alerts,
      availability: {
        todaySales: todayAccounting.salesRecordCount > 0,
        todayPurchases: todayAccounting.purchaseRecordCount > 0,
        monthSales: accounting.salesRecordCount > 0,
        monthPurchases: accounting.purchaseRecordCount > 0,
        sales: accounting.salesRecordCount > 0,
        invoices: invoices.length > 0
      }
    };
  }
};
