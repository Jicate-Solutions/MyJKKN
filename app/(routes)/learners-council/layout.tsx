/**
 * Learners Council Module Layout
 * Provides consistent navigation across all LC module pages
 * NOTE: Auth is NOT checked here — each page.tsx handles its own auth.
 * This avoids double getEnhancedUserProfile() calls which fail in Next.js 16 Turbopack.
 */

import { Suspense } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { LCNav } from './lc-nav';

interface LCLayoutProps {
  children: React.ReactNode;
}

export default function LearnersCouncilLayout({ children }: LCLayoutProps) {
  return (
    <ContentLayout title="Learners Council">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learners Council', href: '/learners-council' }
        ]}
      />

      <div className="space-y-6 mt-4">
        <LCNav showSelectionTab={true} />

        <Suspense fallback={<div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
          {children}
        </Suspense>
      </div>
    </ContentLayout>
  );
}
