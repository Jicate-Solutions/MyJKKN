'use client';

import { Toaster } from '@/components/ui/toaster';
import { Toaster as HotToaster } from 'react-hot-toast';
import { Toaster as SonnerToaster } from 'sonner';
import AdminPanelLayout from '@/components/layout/admin-panel-layout';
import { QueryClientProvider } from '@/providers/query-provider';
import { BugReporterWidget } from '@/components/bug-reporter/bug-reporter-widget';
import { WorkPulseFab } from '@/components/work-pulse-fab';
import { AcknowledgmentGate } from '@/components/notifications/acknowledgment-gate';
import { AutoTabNav } from '@/components/navigation/auto-tab-nav';
import { AutoBreadcrumbs } from '@/components/navigation/auto-breadcrumbs';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const Dashboardlayout = ({ children }: DashboardLayoutProps) => {
  return (
    <QueryClientProvider>
      <AcknowledgmentGate>
      <AdminPanelLayout>
        {/*
          AutoTabNav: self-discovering in-page tab bar.
          Renders 0..N tiers based on the current pathname's depth and the
          generated route manifest (lib/navigation/route-manifest.generated.ts,
          built from app/(routes)/** by scripts/generate-route-manifest.ts).
          Any new page.tsx is automatically picked up — no per-section
          layout.tsx maintenance.
         */}
        {/*
          AutoBreadcrumbs: self-discovering Home › Module › Section › Page
          trail, derived from usePathname() + the same generated route
          manifest that powers AutoTabNav. Coexists with per-page
          <PageBreadcrumb items={[...]} /> calls — a follow-up sweep can
          remove those once this is verified. Skips /, /auth/*, /api/*.
         */}
        <div className='px-4 md:px-8 pt-3'>
          <AutoBreadcrumbs />
        </div>
        <div className='px-4 md:px-8 pt-2'>
          <AutoTabNav />
        </div>
        {children}
        <Toaster />
        <SonnerToaster position="top-right" richColors closeButton />
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
      </AcknowledgmentGate>
    </QueryClientProvider>
  );
};

export default Dashboardlayout;
