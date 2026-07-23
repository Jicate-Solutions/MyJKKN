/**
 * New PDE Demonstration — server component shell.
 *
 * Renders the client-side <DemonstrationForm /> with no server-prefetched
 * rubric data; the form fetches rubrics on category change via the same
 * /api/pde/demonstrations/rubrics-for-category endpoint (T1.2). For Tier 1.1
 * the form ships with the rubric dropdown hidden when the category has no
 * seeded rubrics — a graceful degradation matching what's actually live.
 *
 * Route: /pde/learn/demonstrations/new
 */

import { Suspense } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { DemonstrationForm } from './_components/DemonstrationForm';

export const dynamic = 'force-dynamic';

export default function NewDemonstrationPage() {
  return (
    <ContentLayout title="New Demonstration">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learn', href: '/learn/quests' },
          { label: 'My Demonstrations', href: '/pde/learn/demonstrations' },
          { label: 'New' },
        ]}
      />
      <div className="mt-6 max-w-3xl">
        {/* DemonstrationForm reads ?edit=<id> via useSearchParams, which Next 15
            requires to sit inside a Suspense boundary. */}
        <Suspense
          fallback={
            <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
          }
        >
          <DemonstrationForm />
        </Suspense>
      </div>
    </ContentLayout>
  );
}
