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
