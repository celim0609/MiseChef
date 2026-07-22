import type { ReactNode } from 'react';
import { Activity, Building2, CreditCard, Database, DollarSign, FlaskConical, HeartPulse, PackageCheck, Settings, Users, WalletCards } from 'lucide-react';

export interface AdminPageDefinition {
  title: string;
  icon: ReactNode;
}

export const adminPageDefinitions: AdminPageDefinition[] = [
  { title: 'Overview', icon: <Activity className="h-5 w-5" /> },
  { title: 'Users', icon: <Users className="h-5 w-5" /> },
  { title: 'Companies', icon: <Building2 className="h-5 w-5" /> },
  { title: 'AI Usage', icon: <Database className="h-5 w-5" /> },
  { title: 'Subscriptions', icon: <CreditCard className="h-5 w-5" /> },
  { title: 'Approved Products', icon: <PackageCheck className="h-5 w-5" /> },
  { title: 'Workspace QA', icon: <FlaskConical className="h-5 w-5" /> },
  { title: 'Finance', icon: <DollarSign className="h-5 w-5" /> },
  { title: 'Infrastructure', icon: <WalletCards className="h-5 w-5" /> },
  { title: 'System Health', icon: <HeartPulse className="h-5 w-5" /> },
  { title: 'Settings', icon: <Settings className="h-5 w-5" /> }
];
