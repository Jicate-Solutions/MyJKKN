'use client';

import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { AccessGate } from '@/components/instasolver/access-gate';
import { IssueForm } from './_components/issue-form';

export default function NewIssuePage() {
  return (
    <AccessGate need="report">
      <div className="space-y-4">
        <PageBreadcrumb
          items={[
            { label: 'InstaSolver', href: '/instasolver/dashboard' },
            { label: 'Issues', href: '/instasolver/issues' },
            { label: 'Report an issue', isCurrent: true }
          ]}
        />
        <PageHeader title="Report an issue" description="Tell us what is broken and where, and the CAO will assign it" />
        <IssueForm />
      </div>
    </AccessGate>
  );
}
