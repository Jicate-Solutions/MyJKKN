// School of Influence — who runs it.
//
// The FIRST consumer of the shared programme-coordinators panel. Everything on
// this page comes from components/shared/programme-coordinators, so the next
// programme that needs the same screen adds a page like this one and no new UI.
//
// A thin server shell, matching the sibling applications and attendance screens.
// All the database work happens in the client panel, because the browser Supabase
// client carries the caller's session and the coordinator RPCs authorise the real
// person; read from a Server Component they would run as `anon` and refuse
// (ref feedback_browser_supabase_client_serverside_returns_empty).
//
// Access is decided in the database, not by this shell. The subtree's
// RoutePermissionGuard admits programme members, so a learner can reach this URL —
// the panel then renders an explicit "you cannot appoint coordinators here — ask
// the COO" surface rather than a silent redirect or an empty list (rule 27).

import type { Metadata } from 'next';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { ProgrammeCoordinatorsPanel } from '@/components/shared/programme-coordinators/programme-coordinators-panel';

// The route manifest and the Ctrl+K palette read this. Without it the page is
// listed under its folder name alone — which is how a programme's screens end up
// searchable only as "Coordinators" (BUG-005799 / BUG-005800).
export const navMeta = {
  label: 'School of Influencer Coordinators',
  icon: 'UserCheck',
} as const;

export const metadata: Metadata = {
  title: 'School of Influencer — Coordinators',
  description:
    'See who runs School of Influencer, appoint a coordinator for the whole programme or for one batch, and remove one with a reason that goes on the record.',
};

export default function SoiCoordinatorsPage() {
  return (
    <ContentLayout title="School of Influencer">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio' },
          { label: 'School of Influencer' },
          { label: 'Coordinators' },
        ]}
      />
      <div className="mt-4">
        <ProgrammeCoordinatorsPanel programmeKind="school_of_influence" />
      </div>
    </ContentLayout>
  );
}
