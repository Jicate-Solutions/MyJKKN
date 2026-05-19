import { MasterTablePage } from '../_components/master-table-page';
import { Badge } from '@/components/ui/badge';

export default function OfferTypesPage() {
  return (
    <MasterTablePage
      tableName="cdc_offer_types"
      title="Offer Types"
      description="Placement offer categories. The 'counts toward placement' flag controls whether this offer type is included in NAAC 5.2.1 and AICTE placement statistics."
      breadcrumbs={[
        { label: 'Admin', href: '/admin' },
        { label: 'CDC', href: '/admin/cdc' },
        { label: 'Offer Types', href: '/admin/cdc/offer-types' },
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
