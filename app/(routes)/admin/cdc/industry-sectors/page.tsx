import { MasterTablePage } from '../_components/master-table-page';

export default function IndustrySectorsPage() {
  return (
    <MasterTablePage
      tableName="cdc_industry_sectors"
      title="Industry Sectors"
      description="Industry classification sectors used to categorise recruiters in the CDC recruiter directory."
      breadcrumbs={[
        { label: 'Admin', href: '/admin' },
        { label: 'CDC', href: '/admin/cdc' },
        { label: 'Industry Sectors', href: '/admin/cdc/industry-sectors' },
      ]}
    />
  );
}
