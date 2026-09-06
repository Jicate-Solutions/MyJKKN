'use client';

// OneMark — the Senior Learner's paper wizard (PRD §3).
// Permission-guarded (foundation.assessments.manage). Denials render an
// explicit 403 (PermissionError), never a silent redirect (CLAUDE.md #27).

import { Suspense } from 'react';
import { usePermissions } from '@/hooks/use-permissions';
import { PermissionError } from '@/components/errors/permission-error';
import { Skeleton } from '@/components/ui/skeleton';
import { FoundationHeader } from '../../_components/foundation-header';
import { PaperWizard } from './_components/paper-wizard';

function WizardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-8">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}

export default function OneMarkPaperWizardPage() {
  const { isLoading, canAccess } = usePermissions();

  if (isLoading) return <WizardSkeleton />;

  if (!canAccess('foundation', 'assessments.manage')) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 md:px-8">
        <PermissionError
          message="You do not have access to build OneMark papers. Ask the Foundation programme lead for the assessment-builder permission."
          requiredPermission="foundation.assessments.manage"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 md:px-8">
      <FoundationHeader
        title="OneMark paper wizard"
        subtitle="Build a Part-I one-score paper for Class 12 Physics or English in five steps — scope, filters, quantity and level mix, preview and swap, then print or publish."
        crumbs={[
          { label: 'Foundation', href: '/foundation' },
          { label: 'Console', href: '/foundation/console' },
          { label: 'OneMark paper' },
        ]}
      />
      <Suspense fallback={<WizardSkeleton />}>
        <PaperWizard />
      </Suspense>
    </div>
  );
}
