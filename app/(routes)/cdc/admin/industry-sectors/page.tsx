import { MasterTablePage } from '../_components/master-table-page';

export default function IndustrySectorsPage() {
  return (
    <MasterTablePage
      tableName="cdc_industry_sectors"
      title="Industry Sectors"
      description="Industry classification sectors used to categorise recruiters in the CDC recruiter directory."
      breadcrumbs={[
        { label: 'CDC', href: '/cdc' },
        { label: 'Admin', href: '/cdc/admin' },
        { label: 'Industry Sectors', href: '/cdc/admin/industry-sectors' },
      ]}
    />
  );
}
