'use client';

import { Toaster } from '@/components/ui/toaster';
import { Toaster as HotToaster } from 'react-hot-toast';
import { Toaster as SonnerToaster } from 'sonner';
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
        {children}
        <Toaster />
        <HotToaster
          position="top-right"
          reverseOrder={false}
          gutter={8}
          toastOptions={{
            duration: 4000,
            style: {
              fontSize: '14px',
              fontWeight: '500',
            }
          }}
        />
        <SonnerToaster
          position="top-right"
          richColors
          duration={4000}
        />
        <BugReporterWidget />
      </QueryClientProvider>
    </AdminPanelLayout>
  );
};

export default Dashboardlayout;
