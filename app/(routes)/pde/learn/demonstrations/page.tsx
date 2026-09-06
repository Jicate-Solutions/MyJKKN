/**
 * Learner Demonstrations Inbox — server component.
 *
 * Lists all PDE demonstrations the current user has authored (draft + in-
 * flight + scored). RLS handles the `learner_id = auth.uid()` filter, so the
 * service call is intentionally bare. The list itself ships as a client
 * component so it can react to inline actions (withdraw, optimistic refresh).
 *
 * Route: /pde/learn/demonstrations  (PDE Tier 1.1)
 */

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { PDEDemonstrationService } from '@/lib/services/pde-demonstration-service';
import type { PDEDemonstration } from '@/lib/types/pde-demonstrations';
import { DemonstrationList } from './_components/DemonstrationList';

export const dynamic = 'force-dynamic';

export default async function LearnerDemonstrationsPage() {
  let rows: PDEDemonstration[] = [];
  let errorMessage: string | null = null;

  try {
    rows = await PDEDemonstrationService.listMine();
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : 'Failed to load demonstrations';
  }

  return (
    <ContentLayout title="My Demonstrations">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learn', href: '/learn/quests' },
          { label: 'My Demonstrations' },
        ]}
      />
      <div className="mt-6">
        <DemonstrationList initialRows={rows} initialError={errorMessage} />
      </div>
    </ContentLayout>
  );
}
