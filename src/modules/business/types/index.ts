import type { DailyDeliveryRecord } from '../dailySalesProjection';

export interface BusinessSale {
  id: string;
  date: string;
  amount: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  workspaceId: string;
}

export interface BusinessDashboardSummary {
  sales: number;
  purchases: number;
  netResult: number;
  purchaseCostPercentage: number | null;
  trend: BusinessDailyTrend[];
  deliveries: DailyDeliveryRecord[];
  topSuppliers: BusinessTopSupplier[];
  alerts: BusinessAlert[];
  availability: {
    sales: boolean;
    purchases: boolean;
  };
}

export type BusinessDashboardPeriod = 'today' | 'this-week' | 'this-month' | 'last-month' | 'custom';

export interface BusinessDateRange {
  from: string;
  to: string;
}

export interface BusinessDailyTrend {
  date: string;
  orderCount: number;
  fulfilmentCount: number;
  itemQuantity: number;
  merchandiseSales: number;
  deliveryRevenue: number;
  refundAdjustments: number;
  sales: number;
  purchases: number;
  purchaseCostPercentage: number | null;
}

export interface BusinessTopSupplier {
  supplier: string;
  totalSpend: number;
  invoiceCount: number;
}

export interface BusinessAlert {
  id: string;
  severity: 'info' | 'warning' | 'danger';
  message: string;
}
