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
  todaySales: number;
  todayPurchases: number;
  monthSales: number;
  monthPurchases: number;
  purchaseCostPercentage: number | null;
  monthlyTrend: BusinessDailyTrend[];
  topSuppliers: BusinessTopSupplier[];
  alerts: BusinessAlert[];
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
