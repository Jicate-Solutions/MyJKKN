'use client';

import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/providers/auth-provider';
import AdminPanelLayout from '@/components/layout/admin-panel-layout';
import { QueryClientProvider } from '@/providers/query-provider';
import { BugReporterWidget } from '@/components/bug-reporter/bug-reporter-widget';

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
          <BugReporterWidget />
        </AuthProvider>
      </QueryClientProvider>
    </AdminPanelLayout>
  );
};

export default Dashboardlayout;
