'use client';

// OneMark — results and analytics (PRD Phase 3). The index of papers this
// Senior Learner can report on. Access is decided by the API, not by a client
// permission test — see the note at the top of ResultsIndex (ruling #1).

import { FoundationHeader } from '../../_components/foundation-header';
import { ResultsIndex } from './_components/results-index';

export default function OneMarkResultsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-6 md:px-8">
      <FoundationHeader
        title="OneMark results"
        subtitle="How each cohort answered a one-score paper — the score list, where the marks were lost by unit, and which questions the paper itself got wrong."
        crumbs={[
          { label: 'Foundation', href: '/foundation' },
          { label: 'OneMark', href: '/foundation/onemark' },
          { label: 'Results' },
        ]}
      />
      <ResultsIndex />
    </div>
  );
}
