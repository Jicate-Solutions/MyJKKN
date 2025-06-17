'use client';

import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/providers/auth-provider';
import AdminPanelLayout from '@/components/layout/admin-panel-layout';
import { QueryClientProvider } from '@/providers/query-provider';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const Dashboardlayout = ({ children }: DashboardLayoutProps) => {
  return (
    <AdminPanelLayout>
      <QueryClientProvider>
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
      </QueryClientProvider>
    </AdminPanelLayout>
  );
};

export default Dashboardlayout;
