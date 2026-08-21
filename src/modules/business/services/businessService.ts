import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '../../../firebase';
import { invoiceService } from '../../costing/services';
import type { CostingInvoice } from '../../costing/types';
import { DEFAULT_REGION_CONFIGURATION } from '../../../regions';
import {
  getBusinessDateKey,
  getBusinessMonthDateKeys,
  getInvoiceKpiDate,
  getInvoiceKpiTotal,
  getPurchaseCostPercentage,
  isPurchaseKpiEligible,
  isSameBusinessDay,
  isSameBusinessMonth
} from '../purchaseKpi';
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

const getInvoiceSupplier = (invoice: CostingInvoice) => invoice.supplier || invoice.extractedData?.supplier || 'Unknown Supplier';

export const businessService = {
  async listSales(workspaceId?: string): Promise<BusinessSale[]> {
    if (!db || !workspaceId) return [];

    const salesQuery = query(collection(db, 'businessSales'), where('workspaceId', '==', workspaceId));
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
    const [sales, invoices] = await Promise.all([
      this.listSales(workspaceId),
      invoiceService.listInvoices(userId, { workspaceId })
    ]);

    const todaySalesRecords = sales.filter(sale => isSameBusinessDay(sale.date, today, timeZone));
    const todaySales = todaySalesRecords
      .reduce((sum, sale) => sum + sale.amount, 0);

    const approvedInvoices = invoices.filter(isPurchaseKpiEligible);

    const todayPurchaseInvoices = approvedInvoices.filter(invoice => getInvoiceKpiDate(invoice, timeZone) === getBusinessDateKey(today, timeZone));
    const todayPurchases = todayPurchaseInvoices
      .reduce((sum, invoice) => sum + getInvoiceKpiTotal(invoice), 0);

    const monthSalesRecords = sales.filter(sale => isSameBusinessMonth(sale.date, today, timeZone));
    const monthSales = monthSalesRecords
      .reduce((sum, sale) => sum + sale.amount, 0);

    const monthInvoices = approvedInvoices
      .filter(invoice => isSameBusinessMonth(getInvoiceKpiDate(invoice, timeZone), today, timeZone));

    const monthPurchases = monthInvoices
      .reduce((sum, invoice) => sum + getInvoiceKpiTotal(invoice), 0);

    const monthlyTrend = getBusinessMonthDateKeys(today, timeZone).map(date => {
      const dailySales = sales
        .filter(sale => sale.date === date)
        .reduce((sum, sale) => sum + sale.amount, 0);
      const dailyPurchases = monthInvoices
        .filter(invoice => getInvoiceKpiDate(invoice, timeZone) === date)
        .reduce((sum, invoice) => sum + getInvoiceKpiTotal(invoice), 0);

      return {
        date,
        sales: dailySales,
        purchases: dailyPurchases,
        purchaseCostPercentage: getPurchaseCostPercentage(dailyPurchases, dailySales)
      };
    });

    const supplierMap = new Map<string, { supplier: string; totalSpend: number; invoiceCount: number }>();
    monthInvoices.forEach(invoice => {
      const supplier = getInvoiceSupplier(invoice);
      const current = supplierMap.get(supplier) || { supplier, totalSpend: 0, invoiceCount: 0 };
      current.totalSpend += getInvoiceKpiTotal(invoice);
      current.invoiceCount += 1;
      supplierMap.set(supplier, current);
    });

    const topSuppliers = Array.from(supplierMap.values())
      .sort((a, b) => b.totalSpend - a.totalSpend)
      .slice(0, 5);

    const purchaseCostPercentage = getPurchaseCostPercentage(monthPurchases, monthSales);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const hasInvoiceThisWeek = invoices.some(invoice => new Date(invoice.uploadDate) >= sevenDaysAgo);
    const alerts = [
      purchaseCostPercentage !== null && purchaseCostPercentage > 35
        ? { id: 'purchase-cost-high', severity: 'danger' as const, message: `Purchase cost is above target at ${purchaseCostPercentage.toFixed(1)}%.` }
        : purchaseCostPercentage !== null && purchaseCostPercentage > 30
          ? { id: 'purchase-cost-watch', severity: 'warning' as const, message: `Purchase cost is approaching target at ${purchaseCostPercentage.toFixed(1)}%.` }
          : null,
      sales.length > 0 && todaySalesRecords.length === 0 ? { id: 'no-sales-today', severity: 'warning' as const, message: 'No sales entered today.' } : null,
      invoices.length > 0 && !hasInvoiceThisWeek ? { id: 'no-invoices-week', severity: 'info' as const, message: 'No invoices uploaded this week.' } : null
    ].filter(Boolean);

    return {
      todaySales,
      todayPurchases,
      monthSales,
      monthPurchases,
      purchaseCostPercentage,
      monthlyTrend,
      topSuppliers,
      alerts,
      availability: {
        todaySales: todaySalesRecords.length > 0,
        todayPurchases: todayPurchaseInvoices.length > 0,
        monthSales: monthSalesRecords.length > 0,
        monthPurchases: monthInvoices.length > 0,
        sales: sales.length > 0,
        invoices: invoices.length > 0
      }
    };
  }
};
