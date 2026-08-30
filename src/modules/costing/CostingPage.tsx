import type { RootTab, UserRole } from '../../types';
import CostingIngredientsPage from './pages/Ingredients';
import InvoiceDetailPage from './pages/InvoiceDetail';
import CostingInvoicesPage from './pages/Invoices';
import CostingReportsPage from './pages/Reports';
import type { QuickAddRequest } from '../../navigation/quickAdd';

interface CostingPageProps {
  activeTab: RootTab;
  userId?: string;
  workspaceId?: string;
  invoiceId?: string | null;
  userRole?: UserRole;
  onOpenInvoice: (invoiceId: string) => void;
  onBackToInvoices: () => void;
  quickAddRequest?: QuickAddRequest | null;
  onQuickAddHandled?: (requestId: number) => void;
}

export default function CostingPage({ activeTab, userId, workspaceId, invoiceId, userRole = 'user', quickAddRequest, onQuickAddHandled, onOpenInvoice, onBackToInvoices }: CostingPageProps) {
  const canManageInvoices = userRole === 'admin';

  switch (activeTab) {
    case 'costingIngredients':
      return <CostingIngredientsPage userId={userId} workspaceId={workspaceId} openCreateRequest={quickAddRequest?.action === 'ingredient' ? quickAddRequest.requestId : undefined} onQuickAddHandled={onQuickAddHandled} />;
    case 'costingInvoices':
      return <CostingInvoicesPage userId={userId} workspaceId={workspaceId} canManageInvoices={canManageInvoices} openUploadRequest={quickAddRequest?.action === 'invoice' ? quickAddRequest.requestId : undefined} onQuickAddHandled={onQuickAddHandled} onOpenInvoice={onOpenInvoice} />;
    case 'costingInvoiceDetail':
      return <InvoiceDetailPage invoiceId={invoiceId} userId={userId} workspaceId={workspaceId} canManageInvoices={canManageInvoices} onBack={onBackToInvoices} />;
    case 'costingReports':
      return <CostingReportsPage />;
    case 'costing':
    default:
      return <CostingInvoicesPage userId={userId} workspaceId={workspaceId} canManageInvoices={canManageInvoices} onOpenInvoice={onOpenInvoice} />;
  }
}
