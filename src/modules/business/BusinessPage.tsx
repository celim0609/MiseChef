import type { RootTab } from '../../types';
import BusinessDashboardPage from './pages/Dashboard';
import BusinessSalesPage from './pages/Sales';
import { SuppliersPage } from '../suppliers';

interface BusinessPageProps {
  activeTab: RootTab;
  userId?: string;
  workspaceId?: string;
}

export default function BusinessPage({ activeTab, userId, workspaceId }: BusinessPageProps) {
  switch (activeTab) {
    case 'businessSales':
      return <BusinessSalesPage userId={userId} workspaceId={workspaceId} />;
    case 'businessSuppliers':
      return <SuppliersPage userId={userId} workspaceId={workspaceId} />;
    case 'business':
    default:
      return <BusinessDashboardPage userId={userId} workspaceId={workspaceId} />;
  }
}
