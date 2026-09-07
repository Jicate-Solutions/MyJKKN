'use client';

// OneMark — one cohort's results sheet. Access is decided by the API and by
// Lane S3's RPC (ruling #1), never by a client permission test here.

import { use } from 'react';
import { FoundationHeader } from '../../../_components/foundation-header';
import { CohortSheet } from './_components/cohort-sheet';

export default function OneMarkCohortResultsPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const { assessmentId } = use(params);
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 md:px-8">
      <FoundationHeader
        title="Cohort results"
        subtitle="The score list first, then what the paper itself revealed — where marks were lost by unit and by question type, and which questions behaved oddly."
        crumbs={[
          { label: 'Foundation', href: '/foundation' },
          { label: 'OneMark', href: '/foundation/onemark' },
          { label: 'Results', href: '/foundation/onemark/results' },
          { label: 'Cohort sheet' },
        ]}
      />
      <CohortSheet assessmentId={assessmentId} />
    </div>
  );
}
