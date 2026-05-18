import { MasterTablePage } from '../_components/master-table-page';

export default function WorkshopTypesPage() {
  return (
    <MasterTablePage
      tableName="cdc_workshop_types"
      title="Workshop Types"
      description="Workshop and seminar categories for CDC career development activities."
      breadcrumbs={[
        { label: 'Admin', href: '/admin' },
        { label: 'CDC', href: '/admin/cdc' },
        { label: 'Workshop Types', href: '/admin/cdc/workshop-types' },
      ]}
    />
  );
}
