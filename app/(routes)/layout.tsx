'use client';

import { Toaster } from '@/components/ui/toaster';
import { Toaster as HotToaster } from 'react-hot-toast';
import AdminPanelLayout from '@/components/layout/admin-panel-layout';
import { QueryClientProvider } from '@/providers/query-provider';
import { BugReporterWidget } from '@/components/bug-reporter/bug-reporter-widget';
import { WorkPulseFab } from '@/components/work-pulse-fab';
import { AcknowledgmentGate } from '@/components/notifications/acknowledgment-gate';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const Dashboardlayout = ({ children }: DashboardLayoutProps) => {
  return (
    <QueryClientProvider>
      <AdminPanelLayout>
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
        <BugReporterWidget />
        <WorkPulseFab />
      </AdminPanelLayout>
    </QueryClientProvider>
  );
};

export default Dashboardlayout;
