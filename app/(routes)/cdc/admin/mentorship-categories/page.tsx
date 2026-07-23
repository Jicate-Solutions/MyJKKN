import { ConfigMasterConsequencePage } from '../_components/config-master-consequence-page';

export default function MentorshipCategoriesPage() {
  return (
    <ConfigMasterConsequencePage
      tableName="cdc_mentorship_categories"
      title="Mentorship Categories"
      description="The focus area of a mentorship engagement (Academic, Career, Technical, Entrepreneurship). Shown as the required Mentorship Category when creating a mentorship."
      breadcrumbs={[
        { label: 'CDC', href: '/cdc' },
        { label: 'Admin', href: '/cdc/admin' },
        { label: 'Mentorship Categories', href: '/cdc/admin/mentorship-categories' },
      ]}
      consequence={{
        usageTable: 'cdc_mentor_pairings',
        usageColumn: 'mentorship_category_id',
        usageType: 'fk',
        formLabel: 'New Mentorship → Category',
        recordNoun: 'mentorships',
      }}
    />
  );
}
