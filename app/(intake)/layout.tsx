'use client';

// app/(intake)/layout.tsx — minimal route-group layout for fast-intake forms
//
// Purpose: chat-bypass-workflow-gravity §5.2 mandates "no sidebar/nav at submit
// time, full-bleed". The /(routes)/ group mounts <AdminPanelLayout> which
// always renders <Sidebar /> + <AutoBreadcrumbs /> + <AutoTabNav />. For intake
// forms (events propose, future admission_leads propose, future
// marketing_collateral propose) we want a focus-mode layout — no sidebar to
// distract the asker, the form is the only visible surface.
//
// What this layout INCLUDES:
//   - <QueryClientProvider> (forms use React Query for the profile fetch)
//   - <Toaster> + <SonnerToaster> + <HotToaster> (form submit feedback)
//   - <SentryUserSync> (error tracking still required)
//
// What this layout DELIBERATELY EXCLUDES:
//   - <Sidebar /> — the whole point of this group
//   - <AdminPanelLayout> — same reason
//   - <AutoBreadcrumbs /> — handled inline by each intake page
//   - <AutoTabNav /> — no nav surface at submit time
//   - <BottomNavbar /> — keep mobile screen height for the form
//   - <BugReporterWidget /> — still useful but renders inside form area
//
// Routes under this group:
//   - /events/propose            (event_proposals — PR-A immediate push trigger)
//   - /events/propose/[id]/status (asker status timeline)
//
// Future (Sprint 2 + Sprint 3):
//   - /admission/leads/propose
//   - /admission/marketing/collateral/propose

import { Fragment } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as HotToaster } from 'react-hot-toast';
import { Toaster as SonnerToaster } from 'sonner';
import { QueryClientProvider } from '@/providers/query-provider';
import { SentryUserSync } from '@/hooks/use-sentry-user-sync';

interface IntakeLayoutProps {
  children: React.ReactNode;
}

export default function IntakeLayout({ children }: IntakeLayoutProps) {
  return (
    <QueryClientProvider>
      <SentryUserSync key='sentry-user-sync' />
      <main className='min-h-screen bg-background'>
        <Fragment key='route-children'>{children}</Fragment>
      </main>
      <Toaster key='toaster' />
      <SonnerToaster
        key='sonner'
        position='top-right'
        richColors
        closeButton
      />
      <HotToaster
        key='hot-toaster'
        position='top-right'
        reverseOrder={false}
      />
    </QueryClientProvider>
  );
}
