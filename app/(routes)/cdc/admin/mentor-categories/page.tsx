import { ConfigMasterConsequencePage } from '../_components/config-master-consequence-page';

export default function MentorCategoriesPage() {
  return (
    <ConfigMasterConsequencePage
      tableName="cdc_mentor_categories"
      title="Mentor Engagement Categories"
      description="How an industry mentor engages with the institution (Guest Lecturer, Project Mentor, Placement Mentor, Advisory Board). Shown as the required Engagement Category when adding an industry mentor."
      breadcrumbs={[
        { label: 'CDC', href: '/cdc' },
        { label: 'Admin', href: '/cdc/admin' },
        { label: 'Mentor Categories', href: '/cdc/admin/mentor-categories' },
      ]}
      consequence={{
        usageTable: 'industry_mentors',
        usageColumn: 'mentor_category_id',
        usageType: 'fk',
        formLabel: 'Add Industry Mentor → Engagement Category',
        recordNoun: 'industry mentors',
      }}
    />
  );
}
