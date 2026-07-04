import type { RootTab } from '../../types';
import BusinessDashboardPage from './pages/Dashboard';
import BusinessSalesPage from './pages/Sales';

interface BusinessPageProps {
  activeTab: RootTab;
  userId?: string;
}

export default function BusinessPage({ activeTab, userId }: BusinessPageProps) {
  switch (activeTab) {
    case 'businessSales':
      return <BusinessSalesPage userId={userId} />;
    case 'business':
    default:
      return <BusinessDashboardPage userId={userId} />;
  }
}
