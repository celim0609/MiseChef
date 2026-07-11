import type { RootTab, UserRole } from '../../types';
import CostingIngredientsPage from './pages/Ingredients';
import InvoiceDetailPage from './pages/InvoiceDetail';
import CostingInvoicesPage from './pages/Invoices';
import CostingReportsPage from './pages/Reports';

interface CostingPageProps {
  activeTab: RootTab;
  userId?: string;
  workspaceId?: string;
  invoiceId?: string | null;
  userRole?: UserRole;
  onOpenInvoice: (invoiceId: string) => void;
  onBackToInvoices: () => void;
}

export default function CostingPage({ activeTab, userId, workspaceId, invoiceId, userRole = 'user', onOpenInvoice, onBackToInvoices }: CostingPageProps) {
  const canManageInvoices = userRole === 'admin';

  switch (activeTab) {
    case 'costingIngredients':
      return <CostingIngredientsPage userId={userId} workspaceId={workspaceId} />;
    case 'costingInvoices':
      return <CostingInvoicesPage userId={userId} workspaceId={workspaceId} canManageInvoices={canManageInvoices} onOpenInvoice={onOpenInvoice} />;
    case 'costingInvoiceDetail':
      return <InvoiceDetailPage invoiceId={invoiceId} userId={userId} workspaceId={workspaceId} canManageInvoices={canManageInvoices} onBack={onBackToInvoices} />;
    case 'costingReports':
      return <CostingReportsPage />;
    case 'costing':
    default:
      return <CostingInvoicesPage userId={userId} workspaceId={workspaceId} canManageInvoices={canManageInvoices} onOpenInvoice={onOpenInvoice} />;
  }
}
