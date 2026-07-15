import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '../../../firebase';
import { invoiceService } from '../../costing/services';
import type { CostingInvoice } from '../../costing/types';
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

const isSameDay = (dateValue: string, target: Date) => dateValue === target.toISOString().slice(0, 10);
const isSameMonth = (dateValue: string, target: Date) => dateValue.slice(0, 7) === target.toISOString().slice(0, 7);
const getDateKey = (value?: string) => (value || '').slice(0, 10);

const getInvoiceTotal = (invoice: CostingInvoice) => Number(invoice.total ?? invoice.extractedData?.total ?? 0);
const getInvoiceDate = (invoice: CostingInvoice) => getDateKey(invoice.invoiceDate || invoice.processingCompletedAt || invoice.uploadDate);
const getInvoiceSupplier = (invoice: CostingInvoice) => invoice.supplier || invoice.extractedData?.supplier || 'Unknown Supplier';

const isApprovedInvoiceProxy = (invoice: CostingInvoice) => invoice.processingStatus === 'Imported' && Boolean(invoice.approvedAt) && !invoice.errorMessage;

const getMonthDateKeys = (today: Date) => {
  const keys: string[] = [];
  const cursor = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  while (cursor <= end) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  return keys;
};

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

  async getDashboardSummary(userId?: string, workspaceId = userId): Promise<BusinessDashboardSummary> {
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

    const todaySalesRecords = sales.filter(sale => isSameDay(sale.date, today));
    const todaySales = todaySalesRecords
      .reduce((sum, sale) => sum + sale.amount, 0);

    const approvedInvoices = invoices.filter(invoice => isApprovedInvoiceProxy(invoice));

    const todayPurchaseInvoices = approvedInvoices.filter(invoice => isSameDay(getInvoiceDate(invoice), today));
    const todayPurchases = todayPurchaseInvoices
      .reduce((sum, invoice) => sum + getInvoiceTotal(invoice), 0);

    const monthSalesRecords = sales.filter(sale => isSameMonth(sale.date, today));
    const monthSales = monthSalesRecords
      .reduce((sum, sale) => sum + sale.amount, 0);

    const monthInvoices = approvedInvoices
      .filter(invoice => isSameMonth(getInvoiceDate(invoice), today));

    const monthPurchases = monthInvoices
      .reduce((sum, invoice) => sum + getInvoiceTotal(invoice), 0);

    const monthlyTrend = getMonthDateKeys(today).map(date => {
      const dailySales = sales
        .filter(sale => sale.date === date)
        .reduce((sum, sale) => sum + sale.amount, 0);
      const dailyPurchases = monthInvoices
        .filter(invoice => getInvoiceDate(invoice) === date)
        .reduce((sum, invoice) => sum + getInvoiceTotal(invoice), 0);

      return {
        date,
        sales: dailySales,
        purchases: dailyPurchases,
        purchaseCostPercentage: dailySales > 0 ? (dailyPurchases / dailySales) * 100 : null
      };
    });

    const supplierMap = new Map<string, { supplier: string; totalSpend: number; invoiceCount: number }>();
    monthInvoices.forEach(invoice => {
      const supplier = getInvoiceSupplier(invoice);
      const current = supplierMap.get(supplier) || { supplier, totalSpend: 0, invoiceCount: 0 };
      current.totalSpend += getInvoiceTotal(invoice);
      current.invoiceCount += 1;
      supplierMap.set(supplier, current);
    });

    const topSuppliers = Array.from(supplierMap.values())
      .sort((a, b) => b.totalSpend - a.totalSpend)
      .slice(0, 5);

    const purchaseCostPercentage = monthSales > 0 ? (monthPurchases / monthSales) * 100 : null;
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
