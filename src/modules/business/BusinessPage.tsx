import type { RootTab } from '../../types';
import BusinessDashboardPage from './pages/Dashboard';
import BusinessSalesPage from './pages/Sales';
import { SuppliersPage } from '../suppliers';
import type { QuickAddRequest } from '../../navigation/quickAdd';

interface BusinessPageProps {
  activeTab: RootTab;
  userId?: string;
  workspaceId?: string;
  quickAddRequest?: QuickAddRequest | null;
  onQuickAddHandled?: (requestId: number) => void;
}

export default function BusinessPage({ activeTab, userId, workspaceId, quickAddRequest, onQuickAddHandled }: BusinessPageProps) {
  switch (activeTab) {
    case 'businessSales':
      return <BusinessSalesPage userId={userId} workspaceId={workspaceId} />;
    case 'businessSuppliers':
      return <SuppliersPage userId={userId} workspaceId={workspaceId} openCreateRequest={quickAddRequest?.action === 'supplier' ? quickAddRequest.requestId : undefined} onQuickAddHandled={onQuickAddHandled} />;
    case 'business':
    default:
      return <BusinessDashboardPage userId={userId} workspaceId={workspaceId} />;
  }
}
