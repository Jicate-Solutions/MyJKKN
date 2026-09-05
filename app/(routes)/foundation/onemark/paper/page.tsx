'use client';

// =============================================================================
// /foundation/onemark/paper — a Senior Learner builds a one-mark paper.
// =============================================================================
// OneMark (TN State Board Class-12 Part-I MCQs), Wave 2 Lane W. Five steps:
// scope → shape → preview → review → output. Wizard state lives in
// fp_assessments.config (kind='mock') and is written on every step change, so
// a half-built paper survives a closed tab. Rulings of record:
// specs/onemark-decisions-2026-09-02.md — decisions 6, 11, 12, 14, 15, 16.
//
// Access: foundation.assessments.manage. Denials render an explicit card with
// the permission named — never a silent redirect.
// =============================================================================

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePermissions } from '@/hooks/use-permissions';
import { PermissionError } from '@/components/errors/permission-error';
import { Skeleton } from '@/components/ui/skeleton';
import { FoundationHeader } from '../../_components/foundation-header';
import { PaperList } from './_components/paper-list';
import { PaperWizard } from './_components/paper-wizard';

function PaperPageBody() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paperId = searchParams.get('paper');

  function openPaper(id: string | null) {
    router.replace(id ? `/foundation/onemark/paper?paper=${encodeURIComponent(id)}` : '/foundation/onemark/paper');
  }

  if (paperId) {
    return <PaperWizard paperId={paperId} onExit={() => openPaper(null)} />;
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 md:px-8">
      <FoundationHeader
        title="One-mark paper"
        subtitle="Build a Part-I paper for Class 12 Physics or English: pick the scope, set the JABT level mix, preview and lock questions, then print or publish."
        crumbs={[{ label: 'Foundation', href: '/foundation' }, { label: 'OneMark' }, { label: 'Paper' }]}
      />
      <PaperList onOpen={openPaper} />
    </div>
  );
}

export default function OneMarkPaperPage() {
  const { isLoading, canAccess } = usePermissions();

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-8">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (!canAccess('foundation', 'assessments.manage')) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 md:px-8">
        <PermissionError
          message="You do not have access to the one-mark paper wizard. It needs the permission below — ask whoever manages roles at your school to add it."
          requiredPermission="foundation.assessments.manage"
        />
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-8">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      }
    >
      <PaperPageBody />
    </Suspense>
  );
}
