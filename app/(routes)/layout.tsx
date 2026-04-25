'use client';

import { Fragment } from 'react';
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
        {/*
          NOTE: Each sibling below carries an explicit `key`. AdminPanelLayout
          wraps `{children}` in a <Suspense>, and React 19's strict offscreen
          reconciliation warns ("Each child in a list should have a unique
          'key' prop") when the children array passes through that boundary
          without keys.
         */}
        <div key='auto-breadcrumbs' className='px-4 md:px-8 pt-3'>
          <AutoBreadcrumbs />
        </div>
        <div key='auto-tab-nav' className='px-4 md:px-8 pt-2'>
          <AutoTabNav />
        </div>
        <Fragment key='route-children'>{children}</Fragment>
        <Toaster key='toaster' />
        <SonnerToaster key='sonner' position="top-right" richColors closeButton />
        <HotToaster
          key='hot-toaster'
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
        <BugReporterWidget key='bug-reporter' />
        <WorkPulseFab key='work-pulse' />
      </AdminPanelLayout>
      </AcknowledgmentGate>
    </QueryClientProvider>
  );
};

export default Dashboardlayout;
