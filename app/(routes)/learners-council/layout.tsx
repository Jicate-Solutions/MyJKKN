/**
 * Learners Council Module Layout
 *
 * Navigation: handled globally by AutoTabNav (components/navigation/
 * auto-tab-nav.tsx), which reads app/(routes)/learners-council/
 * nav-config.ts and renders 7 grouped module tabs. No per-module LCNav
 * needed.
 *
 * Breadcrumbs handled globally by AutoBreadcrumbs (PR #364). No per-module
 * <PageBreadcrumb> needed either.
 *
 * Auth is NOT checked here — each page.tsx handles its own auth.
 */

import { Suspense } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';

interface LCLayoutProps {
  children: React.ReactNode;
}

export default function LearnersCouncilLayout({ children }: LCLayoutProps) {
  return (
    <ContentLayout title="Learners Council">
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        }
      >
        {children}
      </Suspense>
    </ContentLayout>
  );
}
