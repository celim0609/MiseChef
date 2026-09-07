import type { CostingInvoice } from '../costing/types';
import type { StoreOrder } from '../store/types';
import type { BusinessDailyTrend, BusinessTopSupplier, BusinessSale } from './types';
import { getInvoiceKpiDate, getInvoiceKpiTotal, getPurchaseCostPercentage, isPurchaseKpiEligible, normalizeInvoiceDate } from './purchaseKpi';

export interface BusinessAccountingReport {
  totalSales: number;
  totalPurchases: number;
  netResult: number;
  purchaseCostPercentage: number | null;
  salesTrend: BusinessDailyTrend[];
  purchaseTrend: BusinessDailyTrend[];
  supplierSpend: BusinessTopSupplier[];
  salesRecordCount: number;
  purchaseRecordCount: number;
}

export const getStoreOrderNetSale = (order: StoreOrder) => {
  if (order.fulfilmentStatus !== 'Completed') return 0;
  const refundedAmount = Math.max(0, Number(order.payment.refundedAmountMinor || 0)) / 100;
  return Math.max(0, Number(order.total || 0) - refundedAmount);
};

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
  const days = new Map<string, { sales: number; purchases: number }>();
  for (let cursor = new Date(`${from}T00:00:00Z`); cursor <= new Date(`${to}T00:00:00Z`); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    days.set(cursor.toISOString().slice(0, 10), { sales: 0, purchases: 0 });
  }
  const addSales = (date: string, amount: number) => {
    const day = days.get(date);
    if (day) day.sales += amount;
  };
  const eligibleInvoices = invoices.filter(invoice => isPurchaseKpiEligible(invoice) && isInDateRange(getInvoiceKpiDate(invoice, timeZone), from, to, timeZone));
  const eligibleManualSales = manualSales.filter(sale => isInDateRange(sale.date, from, to, timeZone));
  const eligibleStoreOrders = storeOrders.filter(order => isInDateRange(order.completedAt, from, to, timeZone));

  eligibleManualSales.forEach(sale => addSales(normalizeInvoiceDate(sale.date, timeZone), Number(sale.amount || 0)));
  eligibleStoreOrders.forEach(order => addSales(normalizeInvoiceDate(order.completedAt, timeZone), getStoreOrderNetSale(order)));
  eligibleInvoices.forEach(invoice => {
    const day = days.get(getInvoiceKpiDate(invoice, timeZone));
    if (day) day.purchases += getInvoiceKpiTotal(invoice);
  });

  const totalSales = [...days.values()].reduce((sum, day) => sum + day.sales, 0);
  const totalPurchases = [...days.values()].reduce((sum, day) => sum + day.purchases, 0);
  const trends = [...days.entries()].map(([date, totals]) => ({
    date,
    sales: totals.sales,
    purchases: totals.purchases,
    purchaseCostPercentage: getPurchaseCostPercentage(totals.purchases, totals.sales)
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
    purchaseTrend: trends,
    supplierSpend: [...supplierMap.values()].sort((a, b) => b.totalSpend - a.totalSpend),
    salesRecordCount: eligibleManualSales.length + eligibleStoreOrders.filter(order => getStoreOrderNetSale(order) > 0).length,
    purchaseRecordCount: eligibleInvoices.length
  };
};
