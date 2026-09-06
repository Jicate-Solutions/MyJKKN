import { ConfigMasterConsequencePage } from '../_components/config-master-consequence-page';

export default function InternshipTypesPage() {
  return (
    <ConfigMasterConsequencePage
      tableName="cdc_internship_types"
      title="Internship Types"
      description="The kinds of internship the CDC runs (Corporate, Clinical Posting, Teaching Practice, Pharmacy Practice). Shown as the required Type when creating an internship."
      breadcrumbs={[
        { label: 'CDC', href: '/cdc' },
        { label: 'Admin', href: '/cdc/admin' },
        { label: 'Internship Types', href: '/cdc/admin/internship-types' },
      ]}
      consequence={{
        usageTable: 'internship_assignments',
        usageColumn: 'internship_type_id',
        usageType: 'fk',
        formLabel: 'New Internship → Type',
        recordNoun: 'internships',
      }}
    />
  );
}
