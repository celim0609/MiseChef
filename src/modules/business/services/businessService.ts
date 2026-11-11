import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../firebase';
import { invoiceService } from '../../costing/services';
import { storeOrderService } from '../../store/services';
import { DEFAULT_REGION_CONFIGURATION } from '../../../regions';
import { calculateBusinessAccounting, createBusinessDashboardSummary, getBusinessDashboardPeriodRange } from '../accounting';
import type { BusinessDashboardSummary, BusinessDateRange, BusinessSale } from '../types';

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

  async getSalesReport(workspaceId: string, { from, to }: BusinessDateRange, timeZone: string) {
    const [manualSales, storeOrders] = await Promise.all([
      this.listSales(workspaceId, { from, to }),
      storeOrderService.listWorkspaceOrdersForBusiness(workspaceId)
    ]);
    return calculateBusinessAccounting({ from, to, invoices: [], manualSales, storeOrders, timeZone });
  },

  async getAccountingReport(userId?: string, workspaceId = userId, from = '', to = '', timeZone = DEFAULT_REGION_CONFIGURATION.timeZone) {
    if (!userId || !workspaceId || !from || !to || from > to) {
      return calculateBusinessAccounting({ from: '1970-01-01', to: '1970-01-01', invoices: [], manualSales: [], storeOrders: [], timeZone });
    }
    const [manualSales, invoices, storeOrders] = await Promise.all([
      this.listSales(workspaceId, { from, to }),
      invoiceService.listInvoices(userId, { workspaceId }),
      storeOrderService.listWorkspaceOrdersForBusiness(workspaceId)
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
