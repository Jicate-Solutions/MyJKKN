'use client';

// =====================================================================
// /hr/admin/policies/new/social-media-conduct
// =====================================================================
// Wave 3 M8: surface hr.new.social_media_conduct (institution-scoped JSONB)
// for Director and CAO edits. Starter content: personal-account boundaries
// and prohibited-post categories for higher-ed staff.
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { NewPolicyEditor, type FieldSpec } from '../_components/NewPolicyEditor';

const FIELDS: FieldSpec[] = [
  {
    key: 'personal_account_boundaries',
    label: 'Personal account boundaries',
    help: 'What staff may and may not do on their personal social media accounts.',
    type: 'json-subtree',
    children: [
      {
        key: 'may_post_about_employer',
        label: 'May post about employer',
        help: 'If on, staff may mention or refer to JKKN in personal posts.',
        type: 'boolean',
      },
      {
        key: 'must_use_personal_disclaimer',
        label: 'Required personal disclaimer text',
        help: 'Disclaimer staff must include when posting about JKKN topics.',
        type: 'string',
      },
      {
        key: 'may_post_about_students_with_consent',
        label: 'May post about students (with written consent)',
        type: 'boolean',
      },
      {
        key: 'may_post_about_colleagues_with_consent',
        label: 'May post about colleagues (with consent)',
        type: 'boolean',
      },
    ],
  },
  {
    key: 'prohibited_posts',
    label: 'Prohibited posts',
    help: 'Categories of social media content that staff must never post. Director can add/remove categories.',
    type: 'string-list-managed',
  },
  {
    key: 'official_communications',
    label: 'Official communications routing',
    help: 'How official statements must reach external channels.',
    type: 'json-subtree',
    children: [
      {
        key: 'must_route_through',
        label: 'Must route through (role/office)',
        help: 'Office or role that owns official institutional communications.',
        type: 'string',
      },
      {
        key: 'personal_accounts_for_official_use_prohibited',
        label: 'Personal accounts for official use prohibited',
        type: 'boolean',
      },
    ],
  },
  {
    key: 'violation_consequences',
    label: 'Violation consequences',
    help: 'Plain-English statement of what happens when this policy is violated.',
    type: 'string',
  },
];

export default function SocialMediaConductPage() {
  return (
    <PermissionGuard module="hr.policies" action="view">
      <ContentLayout title="Social Media Conduct">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR' },
            { label: 'Policies' },
            { label: 'New — Social Media Conduct' },
          ]}
        />
        <div className="rounded-lg border border-border bg-muted/30 p-5 text-sm text-muted-foreground mb-4">
          What staff and faculty can and cannot post on personal social media
          accounts; how official communications are routed; what violations
          trigger. Starter draft modeled on Indian higher-ed staff conduct
          norms. Director and CAO should customize for JKKN before publishing.
        </div>
        <NewPolicyEditor policyKey="hr.new.social_media_conduct" fields={FIELDS} />
      </ContentLayout>
    </PermissionGuard>
  );
}
