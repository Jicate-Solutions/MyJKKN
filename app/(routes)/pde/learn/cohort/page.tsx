// =====================================================================
// /pde/learn/cohort — Learner peer-relative view (PDE Tier 1.3)
// =====================================================================
// Shows the current learner's score per category alongside the cohort
// average. Percentile and numeric score visibility are controlled by
// the pde.visibility.individual_metric_display policy — the service
// returns the display flags; the card honors them.
//
// Server component: aggregation happens on the server, the card just
// renders the resulting shape.
// =====================================================================

import { redirect } from 'next/navigation';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';

import { getAuthUser } from '@/lib/supabase/server';
import { PDECohortService } from '@/lib/services/pde-cohort-service';
import { PeerRelativeCard } from './_components/PeerRelativeCard';

export const navMeta = {
  label: 'PDE Cohort Comparison',
  icon: 'Users',
} as const;

export default async function LearnerPdeCohortPage() {
  const { user } = await getAuthUser();
  if (!user) {
    redirect('/auth/login?next=/pde/learn/cohort');
  }

  const data = await PDECohortService.getLearnerPeerRelative(user.id);

  return (
    <ContentLayout title="My PDE — Cohort Comparison">
      <PageBreadcrumb
        items={[
          { label: 'Dashboard', href: '/' },
          { label: 'Learn', href: '/learn' },
          { label: 'PDE' },
          { label: 'Cohort Comparison' },
        ]}
      />
      <PeerRelativeCard data={data} />
    </ContentLayout>
  );
}
