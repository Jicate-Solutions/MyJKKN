'use client';

// =====================================================================
// /hr/admin/policies/new/genai-usage
// =====================================================================
// Wave 3 M8: surface hr.new.genai_usage (institution-scoped JSONB) for
// Director and CAO edits. Seeded as draft_only starter content based on
// NIST AI RMF 1.0 + UGC AI guidelines + IIT Madras AI usage policy.
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { NewPolicyEditor, type FieldSpec } from '../_components/NewPolicyEditor';

const FIELDS: FieldSpec[] = [
  {
    key: 'permitted_uses',
    label: 'Permitted uses',
    help: 'GenAI use cases that staff and faculty are allowed to do. Add, remove, or reorder as Director decides.',
    type: 'string-list-managed',
  },
  {
    key: 'prohibited_uses',
    label: 'Prohibited uses',
    help: 'GenAI use cases that are explicitly banned. Violations route through the disciplinary action policy.',
    type: 'string-list-managed',
  },
  {
    key: 'disclosure_requirements',
    label: 'Disclosure requirements',
    help: 'When staff/faculty must disclose AI assistance in their work.',
    type: 'json-subtree',
    children: [
      {
        key: 'required_for',
        label: 'Required for (document types)',
        help: 'Document types where disclosure is mandatory.',
        type: 'string-list-managed',
      },
      {
        key: 'format',
        label: 'Disclosure format',
        help: 'How the disclosure should appear in the document.',
        type: 'string',
      },
    ],
  },
  {
    key: 'approved_ai_tools',
    label: 'Approved AI tools',
    help: 'Specific tools staff may use. Use the (no PII) suffix where relevant.',
    type: 'string-list-managed',
  },
  {
    key: 'blocked_ai_tools',
    label: 'Blocked AI tools',
    help: 'Specific tools staff must NOT use, e.g. tools with weak data privacy.',
    type: 'string-list-managed',
  },
  {
    key: 'training_required',
    label: 'AI usage training required before access',
    help: 'If on, staff complete an AI-usage induction before using approved tools for work.',
    type: 'boolean',
  },
  {
    key: 'review_cycle_months',
    label: 'Policy review cycle (months)',
    help: 'How often this policy is revisited as AI capabilities evolve.',
    type: 'number',
  },
];

export default function GenAiUsagePage() {
  return (
    <PermissionGuard module="hr.policies" action="view">
      <ContentLayout title="GenAI Usage">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR' },
            { label: 'Policies' },
            { label: 'New — GenAI Usage' },
          ]}
        />
        <div className="rounded-lg border border-border bg-muted/30 p-5 text-sm text-muted-foreground mb-4">
          What staff and faculty can and cannot do with generative AI tools
          (ChatGPT, Claude, Gemini, local models). Starter draft based on
          NIST AI RMF, UGC AI guidelines, and IIT Madras institutional AI
          policy. Director and CAO should customize for JKKN before publishing.
        </div>
        <NewPolicyEditor policyKey="hr.new.genai_usage" fields={FIELDS} />
      </ContentLayout>
    </PermissionGuard>
  );
}
