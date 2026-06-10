import { MasterTablePage } from '../_components/master-table-page';

export default function WorkshopTypesPage() {
  return (
    <MasterTablePage
      tableName="cdc_workshop_types"
      title="Workshop Types"
      description="Workshop and seminar categories for CDC career development activities."
      breadcrumbs={[
        { label: 'CDC', href: '/cdc' },
        { label: 'Admin', href: '/cdc/admin' },
        { label: 'Workshop Types', href: '/cdc/admin/workshop-types' },
      ]}
    />
  );
}
