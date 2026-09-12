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
import { Badge } from '@/components/ui/badge';

export default function OfferTypesPage() {
  return (
    <MasterTablePage
      tableName="cdc_offer_types"
      title="Offer Types"
      description="Placement offer categories. The 'counts toward placement' flag controls whether this offer type is included in NAAC 8.2 (Graduate Progression) and AICTE placement statistics."
      breadcrumbs={[
        { label: 'CDC', href: '/cdc' },
        { label: 'Admin', href: '/cdc/admin' },
        { label: 'Offer Types', href: '/cdc/admin/offer-types' },
      ]}
      extraFields={[
        {
          key: 'counts_toward_placement',
          label: 'Counts toward placement statistics (NAAC/AICTE)',
          type: 'boolean',
        },
      ]}
      extraListColumns={[
        {
          key: 'counts_toward_placement',
          label: 'NAAC / AICTE',
          render: (row) => (
            <Badge variant={row.counts_toward_placement ? 'default' : 'outline'} className="text-xs">
              {row.counts_toward_placement ? 'Included' : 'Excluded'}
            </Badge>
          ),
        },
      ]}
    />
  );
}
