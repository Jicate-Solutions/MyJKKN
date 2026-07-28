// ============================================================================
// /admin/teaching-cohorts — the config-row screen for the teaching-enterprise
// participant layer.
// ============================================================================
// Spec: specs/teaching-enterprise-spine-generalization-2026-07-26.md (Phase 1b)
//
// Standing rule (2026-04-29): every policy decision = a config-table row + a UI
// to write it. Before this, "who is an MBA Associate" was a hardcoded WHERE
// clause inside the participant sync — changing it meant a migration. It is now
// a row in `teaching_enterprise_cohorts`, editable here in seconds.
//
// Access: improvement.board.manage OR super administrator. The gate lives in
// the client component so the loading state can be rendered as a skeleton
// (a `return null` while permissions load causes a layout shift), and the
// denied state renders an explicit no-access panel — never a silent redirect.
// The RPCs behind it re-check the same permission server-side, so the UI gate
// is convenience, not the security boundary.
// ============================================================================

export const dynamic = 'force-dynamic';
export const navMeta = { label: 'Teaching Cohorts', icon: 'Layers' } as const;

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';

import { TeachingCohortsClient } from './_components/teaching-cohorts-client';

export default function TeachingCohortsPage() {
  return (
    <ContentLayout>
      <PageBreadcrumb
        items={[
          { label: 'Dashboard', href: '/' },
          { label: 'Administration' },
          { label: 'Teaching Cohorts' },
        ]}
      />
      <div className="mt-6">
        <TeachingCohortsClient />
      </div>
    </ContentLayout>
  );
}
