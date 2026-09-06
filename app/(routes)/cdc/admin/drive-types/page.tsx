'use client';

// CLIENT COMPONENT ON PURPOSE (2026-09-06). This page passes an
// `extraListColumns[].render` FUNCTION to <MasterTablePage>, which is a client
// component ('use client'). A server component may not hand a function across
// that boundary — Next.js throws at render and the page shows the generic
// "Something went wrong … Server Components render" card, with no clue which
// prop caused it. Measured on production 2026-09-06: this page and
// /cdc/admin/training-types both crashed for a super admin; the siblings that
// pass render functions AND declare 'use client' (recruiters, exam-topic-map)
// render fine. There is no server-only work here — the component is sync and
// the guard below is itself a client component — so the directive is free.
// Do not remove it while an `extraListColumns[].render` prop is passed.
import { MasterTablePage } from '../_components/master-table-page';

export default function DriveTypesPage() {
  return (
    <MasterTablePage
      tableName="cdc_drive_types"
      title="Drive Types"
      description="Placement drive categories available to coordinators when creating a new drive. System types cannot be deactivated."
      breadcrumbs={[
        { label: 'CDC', href: '/cdc' },
        { label: 'Admin', href: '/cdc/admin' },
        { label: 'Drive Types', href: '/cdc/admin/drive-types' },
      ]}
      extraListColumns={[
        {
          key: 'skip_states',
          label: 'Skipped states',
          render: (row) =>
            row.skip_states?.length ? (
              <span className="text-xs font-mono">{(row.skip_states as string[]).join(', ')}</span>
            ) : (
              <span className="text-muted-foreground text-xs">—</span>
            ),
        },
      ]}
    />
  );
}
