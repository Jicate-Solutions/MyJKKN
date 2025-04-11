'use client';

import AdminPanelLayout from '@/components/layout/admin-panel-layout';
import { AuthProvider } from '@/providers/auth-provider';
import { QueryClientProvider } from '../../providers/query-provider';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const Dashboardlayout = ({ children }: DashboardLayoutProps) => {
  return (
    <AdminPanelLayout>
      <QueryClientProvider>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    </AdminPanelLayout>
  );
};

export default Dashboardlayout;
