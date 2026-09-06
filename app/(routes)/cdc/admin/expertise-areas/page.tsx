import { ConfigMasterConsequencePage } from '../_components/config-master-consequence-page';

export default function ExpertiseAreasPage() {
  return (
    <ConfigMasterConsequencePage
      tableName="cdc_expertise_areas"
      title="Expertise Areas"
      description="The expertise tags available for industry mentors (AI/ML, Cloud, Finance, …). Curate this list freely — it drives the Expertise Areas multi-select on the Add Industry Mentor form."
      breadcrumbs={[
        { label: 'CDC', href: '/cdc' },
        { label: 'Admin', href: '/cdc/admin' },
        { label: 'Expertise Areas', href: '/cdc/admin/expertise-areas' },
      ]}
      consequence={{
        usageTable: 'industry_mentors',
        usageColumn: 'expertise_area_ids',
        usageType: 'array',
        formLabel: 'Add Industry Mentor → Expertise Areas',
        recordNoun: 'mentors',
      }}
    />
  );
}
