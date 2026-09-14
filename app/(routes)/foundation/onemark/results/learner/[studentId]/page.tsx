'use client';

// OneMark — one learner's report. Reached from a cohort sheet (which supplies
// ?exam=) and, later, from the learner profile screen that Lane N wires.

import { Suspense, use } from 'react';
import { useSearchParams } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { FoundationHeader } from '../../../../_components/foundation-header';
import { LearnerReportView } from './_components/learner-report-view';

function ReportBody({ studentId }: { studentId: string }) {
  const params = useSearchParams();
  return <LearnerReportView studentId={studentId} examId={params.get('exam')} />;
}

export default function OneMarkLearnerReportPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = use(params);
  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-6 md:px-8">
      <FoundationHeader
        title="Learner report"
        subtitle="One learner's OneMark record for a subject — accuracy by unit, where the mistake vault stands, and the recent sittings behind both."
        crumbs={[
          { label: 'Foundation', href: '/foundation' },
          { label: 'OneMark', href: '/foundation/onemark' },
          { label: 'Results', href: '/foundation/onemark/results' },
          { label: 'Learner' },
        ]}
      />
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
        <ReportBody studentId={studentId} />
      </Suspense>
    </div>
  );
}
