import type { CostingInvoice } from '../costing/types';
import { projectDailyDeliveries, projectDailySales } from './dailySalesProjection';
import type { StoreOrder } from '../store/types';
import type {
  BusinessDashboardPeriod,
  BusinessDashboardSummary,
  BusinessDailyTrend,
  BusinessTopSupplier,
  BusinessSale,
  BusinessDateRange
} from './types';
import { getBusinessDateKey, getInvoiceKpiDate, getInvoiceKpiTotal, getPurchaseCostPercentage, isPurchaseKpiEligible, normalizeInvoiceDate } from './purchaseKpi';

export interface BusinessAccountingReport {
  totalSales: number;
  totalPurchases: number;
  netResult: number;
  purchaseCostPercentage: number | null;
  salesTrend: BusinessDailyTrend[];
  salesEntries: ReturnType<typeof projectDailySales>;
  deliveries: ReturnType<typeof projectDailyDeliveries>;
  purchaseTrend: BusinessDailyTrend[];
  supplierSpend: BusinessTopSupplier[];
  salesRecordCount: number;
  purchaseRecordCount: number;
}

interface BusinessAccountingDay {
  manualSalesMinor: number;
  purchases: number;
  orderIds: Set<string>;
  fulfilmentCount: number;
  itemQuantity: number;
  merchandiseMinor: number;
  deliveryMinor: number;
  refundMinor: number;
}

const shiftDateKey = (dateKey: string, days: number) => {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export const getBusinessDashboardPeriodRange = ({
  period,
  now,
  timeZone,
  customFrom = '',
  customTo = ''
}: {
  period: BusinessDashboardPeriod;
  now: Date;
  timeZone: string;
  customFrom?: string;
  customTo?: string;
}): BusinessDateRange | null => {
  const today = getBusinessDateKey(now, timeZone);
  if (!today) return null;
  if (period === 'today') return { from: today, to: today };
  if (period === 'this-month') return { from: `${today.slice(0, 7)}-01`, to: today };
  if (period === 'this-week') {
    const day = new Date(`${today}T00:00:00Z`).getUTCDay();
    return { from: shiftDateKey(today, -((day + 6) % 7)), to: today };
  }
  if (period === 'last-month') {
    const firstOfThisMonth = `${today.slice(0, 7)}-01`;
    const lastOfPreviousMonth = shiftDateKey(firstOfThisMonth, -1);
    return { from: `${lastOfPreviousMonth.slice(0, 7)}-01`, to: lastOfPreviousMonth };
  }
  const from = normalizeInvoiceDate(customFrom, timeZone);
  const to = normalizeInvoiceDate(customTo, timeZone);
  return from && to && from <= to ? { from, to } : null;
};

export const getStoreOrderNetSale = (order: StoreOrder) => (
  projectDailySales(order).reduce((total, entry) => total + entry.totalMinor, 0) / 100
);

const isInDateRange = (date: string, from: string, to: string, timeZone: string) => {
  const key = normalizeInvoiceDate(date, timeZone);
  return Boolean(key) && key >= from && key <= to;
};

const getSupplier = (invoice: CostingInvoice) => invoice.supplier || invoice.extractedData?.supplier || 'Unknown Supplier';

export const calculateBusinessAccounting = ({
  from,
  to,
  invoices,
  manualSales,
  storeOrders,
  timeZone
}: {
  from: string;
  to: string;
  invoices: CostingInvoice[];
  manualSales: BusinessSale[];
  storeOrders: StoreOrder[];
  timeZone: string;
}): BusinessAccountingReport => {
  const days = new Map<string, BusinessAccountingDay>();
  for (let cursor = new Date(`${from}T00:00:00Z`); cursor <= new Date(`${to}T00:00:00Z`); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    days.set(cursor.toISOString().slice(0, 10), {
      manualSalesMinor: 0, purchases: 0, orderIds: new Set(), fulfilmentCount: 0,
      itemQuantity: 0, merchandiseMinor: 0, deliveryMinor: 0, refundMinor: 0
    });
  }
  const eligibleInvoices = invoices.filter(invoice => isPurchaseKpiEligible(invoice) && isInDateRange(getInvoiceKpiDate(invoice, timeZone), from, to, timeZone));
  const eligibleManualSales = manualSales.filter(sale => isInDateRange(sale.date, from, to, timeZone));
  const orders = [...new Map(storeOrders.map(order => [order.id, order])).values()];
  const salesEntries: ReturnType<typeof projectDailySales> = [];
  const deliveries = orders.flatMap(projectDailyDeliveries).flatMap(delivery => {
    const date = normalizeInvoiceDate(delivery.date, timeZone);
    return days.has(date) ? [{ ...delivery, date }] : [];
  }).sort((a, b) => b.date.localeCompare(a.date) || a.orderId.localeCompare(b.orderId));
  eligibleManualSales.forEach(sale => {
    const day = days.get(normalizeInvoiceDate(sale.date, timeZone));
    if (day) day.manualSalesMinor += Math.round(Number(sale.amount || 0) * 100);
  });
  orders.flatMap(projectDailySales).forEach(entry => {
    const day = days.get(getBusinessDateKey(new Date(entry.completedAt), timeZone));
    if (!day) return;
    salesEntries.push(entry);
    day.orderIds.add(entry.orderId);
    day.fulfilmentCount++;
    day.itemQuantity += entry.itemQuantity;
    day.merchandiseMinor += entry.merchandiseMinor;
    day.deliveryMinor += entry.deliveryMinor;
    day.refundMinor += entry.refundMinor;
  });
  eligibleInvoices.forEach(invoice => {
    const day = days.get(getInvoiceKpiDate(invoice, timeZone));
    if (day) day.purchases += getInvoiceKpiTotal(invoice);
  });

  const salesMinor = (day: BusinessAccountingDay) => (
    day.manualSalesMinor + day.merchandiseMinor + day.deliveryMinor
  );
  const totalSales = [...days.values()].reduce((sum, day) => sum + salesMinor(day), 0) / 100;
  const totalPurchases = [...days.values()].reduce((sum, day) => sum + day.purchases, 0);
  const trends = [...days.entries()].map(([date, day]) => ({
    date,
    sales: salesMinor(day) / 100,
    purchases: day.purchases,
    purchaseCostPercentage: getPurchaseCostPercentage(day.purchases, salesMinor(day) / 100),
    orderCount: day.orderIds.size,
    fulfilmentCount: day.fulfilmentCount,
    itemQuantity: day.itemQuantity,
    merchandiseSales: day.merchandiseMinor / 100,
    deliveryRevenue: day.deliveryMinor / 100,
    refundAdjustments: day.refundMinor / 100
  }));
  const supplierMap = new Map<string, BusinessTopSupplier>();
  eligibleInvoices.forEach(invoice => {
    const supplier = getSupplier(invoice);
    const current = supplierMap.get(supplier) || { supplier, totalSpend: 0, invoiceCount: 0 };
    current.totalSpend += getInvoiceKpiTotal(invoice);
    current.invoiceCount += 1;
    supplierMap.set(supplier, current);
  });
  return {
    totalSales,
    totalPurchases,
    netResult: totalSales - totalPurchases,
    purchaseCostPercentage: getPurchaseCostPercentage(totalPurchases, totalSales),
    salesTrend: trends,
    salesEntries,
    deliveries,
    purchaseTrend: trends,
    supplierSpend: [...supplierMap.values()].sort((a, b) => b.totalSpend - a.totalSpend),
    salesRecordCount: eligibleManualSales.length + new Set(salesEntries.map(entry => entry.orderId)).size,
    purchaseRecordCount: eligibleInvoices.length
  };
};

export const createBusinessDashboardSummary = (accounting: BusinessAccountingReport): BusinessDashboardSummary => {
  const { totalSales, totalPurchases, netResult, purchaseCostPercentage } = accounting;
  const alerts = [
    purchaseCostPercentage !== null && purchaseCostPercentage > 35
      ? { id: 'purchase-cost-high', severity: 'danger' as const, message: `Purchase cost is above target at ${purchaseCostPercentage.toFixed(1)}%.` }
      : purchaseCostPercentage !== null && purchaseCostPercentage > 30
        ? { id: 'purchase-cost-watch', severity: 'warning' as const, message: `Purchase cost is approaching target at ${purchaseCostPercentage.toFixed(1)}%.` }
        : null,
    accounting.salesRecordCount === 0
      ? { id: 'no-sales-period', severity: 'warning' as const, message: 'No sales recorded for the selected period.' }
      : null,
    accounting.purchaseRecordCount === 0
      ? { id: 'no-purchases-period', severity: 'info' as const, message: 'No approved invoice purchases recorded for the selected period.' }
      : null
  ].filter((alert): alert is NonNullable<typeof alert> => Boolean(alert));

  return {
    sales: totalSales,
    purchases: totalPurchases,
    netResult,
    purchaseCostPercentage,
    trend: accounting.salesTrend,
    deliveries: accounting.deliveries,
    topSuppliers: accounting.supplierSpend.slice(0, 5),
    alerts,
    availability: {
      sales: accounting.salesRecordCount > 0,
      purchases: accounting.purchaseRecordCount > 0
    }
  };
};
