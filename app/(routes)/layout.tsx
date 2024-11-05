'use client';

import AdminPanelLayout from '@/components/layout/admin-panel-layout';
import { AuthProvider } from '@/providers/auth-provider';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const Dashboardlayout = ({ children }: DashboardLayoutProps) => {
  return (
    <AdminPanelLayout>
      <AuthProvider>{children}</AuthProvider>
    </AdminPanelLayout>
  );
};

export default Dashboardlayout;
