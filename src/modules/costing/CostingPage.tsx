import type { RootTab } from '../../types';
import CostingIngredientsPage from './pages/Ingredients';
import InvoiceDetailPage from './pages/InvoiceDetail';
import CostingInvoicesPage from './pages/Invoices';
import CostingReportsPage from './pages/Reports';

interface CostingPageProps {
  activeTab: RootTab;
  userId?: string;
  invoiceId?: string | null;
  onOpenInvoice: (invoiceId: string) => void;
  onBackToInvoices: () => void;
}

export default function CostingPage({ activeTab, userId, invoiceId, onOpenInvoice, onBackToInvoices }: CostingPageProps) {
  switch (activeTab) {
    case 'costingIngredients':
      return <CostingIngredientsPage userId={userId} />;
    case 'costingInvoices':
      return <CostingInvoicesPage userId={userId} onOpenInvoice={onOpenInvoice} />;
    case 'costingInvoiceDetail':
      return <InvoiceDetailPage invoiceId={invoiceId} userId={userId} onBack={onBackToInvoices} />;
    case 'costingReports':
      return <CostingReportsPage />;
    case 'costing':
    default:
      return <CostingInvoicesPage userId={userId} onOpenInvoice={onOpenInvoice} />;
  }
}
