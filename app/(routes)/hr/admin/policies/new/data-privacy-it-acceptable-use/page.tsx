'use client';

// =====================================================================
// /hr/admin/policies/new/data-privacy-it-acceptable-use
// =====================================================================
// Wave 3 M8: surface hr.new.data_privacy_it_acceptable_use (institution-
// scoped JSONB) for Director and CAO edits. Starter content based on
// Digital Personal Data Protection Act 2023 (Ministry of Electronics & IT).
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { NewPolicyEditor, type FieldSpec } from '../_components/NewPolicyEditor';

const FIELDS: FieldSpec[] = [
  {
    key: 'student_data_handling',
    label: 'Student data handling',
    help: 'How student personal data is collected, stored, and deleted. DPDP Act 2023 compliant defaults.',
    type: 'json-subtree',
    children: [
      {
        key: 'lawful_processing_basis',
        label: 'Lawful processing basis',
        help: 'On what legal ground student data is processed.',
        type: 'enum',
        enumOptions: ['consent_or_legitimate_purpose', 'consent_only', 'legitimate_purpose_only'],
      },
      {
        key: 'encryption_at_rest_required',
        label: 'Encryption at rest required',
        type: 'boolean',
      },
      {
        key: 'encryption_in_transit_required',
        label: 'Encryption in transit required',
        type: 'boolean',
      },
      {
        key: 'data_localization_india_required',
        label: 'Data localization (India) required',
        help: 'If on, student data must be stored on India-located servers.',
        type: 'boolean',
      },
      {
        key: 'deletion_on_request_window_days',
        label: 'Deletion-on-request window (days)',
        help: 'How many days the institution has to delete data after a student requests deletion.',
        type: 'number',
      },
      {
        key: 'breach_notification_window_hours',
        label: 'Breach notification window (hours)',
        help: 'How quickly a data breach must be notified to authorities and affected students. DPDP default is 72.',
        type: 'number',
      },
    ],
  },
  {
    key: 'college_device_use',
    label: 'College device use',
    help: 'Rules for college-issued laptops, desktops, and mobile devices.',
    type: 'json-subtree',
    children: [
      {
        key: 'personal_use_permitted_outside_working_hours',
        label: 'Personal use permitted outside working hours',
        type: 'boolean',
      },
      {
        key: 'monitored',
        label: 'Device activity monitored',
        type: 'boolean',
      },
      {
        key: 'antivirus_required',
        label: 'Antivirus required',
        type: 'boolean',
      },
      {
        key: 'no_unauthorized_software_install',
        label: 'No unauthorized software install',
        type: 'boolean',
      },
    ],
  },
  {
    key: 'byod_rules',
    label: 'BYOD (Bring Your Own Device) rules',
    help: 'Rules when staff use personal devices for work.',
    type: 'json-subtree',
    children: [
      {
        key: 'permitted',
        label: 'BYOD permitted',
        type: 'boolean',
      },
      {
        key: 'mdm_enrollment_required_for_student_data_access',
        label: 'MDM enrollment required for student-data access',
        help: 'If on, personal device must be enrolled in MDM before it can access student data.',
        type: 'boolean',
      },
      {
        key: 'approved_apps_only_for_official_data',
        label: 'Approved apps only for official data',
        type: 'boolean',
      },
    ],
  },
  {
    key: 'phishing_reporting',
    label: 'Phishing reporting',
    help: 'How staff report suspected phishing attempts.',
    type: 'json-subtree',
    children: [
      {
        key: 'report_to',
        label: 'Report to (channel)',
        type: 'string',
      },
      {
        key: 'no_consequences_for_false_positives',
        label: 'No consequences for false positives',
        help: 'If on, staff are encouraged to report suspicious emails without fear of penalty when wrong.',
        type: 'boolean',
      },
    ],
  },
  {
    key: 'password_hygiene',
    label: 'Password hygiene',
    help: 'Minimum standards for staff and faculty passwords.',
    type: 'json-subtree',
    children: [
      {
        key: 'min_length',
        label: 'Minimum length',
        type: 'number',
      },
      {
        key: 'rotation_days',
        label: 'Password rotation (days)',
        help: 'How often passwords must be changed. Set 0 to disable forced rotation.',
        type: 'number',
      },
      {
        key: 'mfa_required_for',
        label: 'MFA required for (system categories)',
        help: 'Categories of system where multi-factor authentication is mandatory.',
        type: 'string-list-managed',
      },
    ],
  },
];

export default function DataPrivacyItAcceptableUsePage() {
  return (
    <PermissionGuard module="hr.policies" action="view">
      <ContentLayout title="Data Privacy & IT Acceptable Use">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR' },
            { label: 'Policies' },
            { label: 'New — Data Privacy & IT Acceptable Use' },
          ]}
        />
        <div className="rounded-lg border border-border bg-muted/30 p-5 text-sm text-muted-foreground mb-4">
          How student personal data is handled, what college devices may be used
          for, BYOD rules, phishing reporting, and password hygiene standards.
          Starter draft modeled on Digital Personal Data Protection Act 2023
          (Ministry of Electronics &amp; IT). Director and CAO should customize
          for JKKN before publishing.
        </div>
        <NewPolicyEditor
          policyKey="hr.new.data_privacy_it_acceptable_use"
          fields={FIELDS}
        />
      </ContentLayout>
    </PermissionGuard>
  );
}
