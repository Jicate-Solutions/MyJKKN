// =====================================================================
// /pde/admin/rubrics/social-leadership — PDE Phase 8 rubric editor
// =====================================================================
// Edits 4 platform_policies rows under pde.rubrics.social_leadership.*
// that define the demonstration rubrics for the durable-value category
// AI cannot replicate: trust, accountability, presence.
//
//   - peer_mentor          (1:1 mentorship of juniors)
//   - team_project_lead    (leading a team artifact)
//   - committee_role       (named role on campus committee)
//   - community_organizer  (event / drive / sustained community)
//
// Director-only (super_admin). Reads via direct table query; writes via
// UPDATE on platform_policies. Save → toast → effective on next
// demonstration submission.
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';

import { SocialLeadershipRubricEditor } from './_components/SocialLeadershipRubricEditor';

export const navMeta = {
  label: 'PDE Rubrics — Social & Leadership',
  icon: 'Users',
} as const;

export default function PdeSocialLeadershipRubricPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="PDE Rubrics — Social & Leadership Trust">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. PDE rubric
            thresholds affect how Phase 8 demonstrations (peer mentorship,
            team leadership, committee roles, community organizing) are
            evaluated across all institutions.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="PDE Rubrics — Social & Leadership Trust">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'PDE' },
            { label: 'Rubrics' },
            { label: 'Social & Leadership Trust' },
          ]}
        />
        <SocialLeadershipRubricEditor />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
