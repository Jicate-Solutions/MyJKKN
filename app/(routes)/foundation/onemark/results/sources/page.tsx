'use client';

// OneMark — source evidence.
//
// GATE, AND WHY IT IS NOT ON THIS PAGE. Ruling #1 of 2026-09-06 makes the read
// an OR, not an AND: `foundation.assessments.manage`, OR an active
// `school_jkkn_owners` row on its own — a principal reading their own school's
// evidence needs no paper-building permission. The browser cannot see that
// second half, and copying half a rule into a page is how a principal gets
// locked out of the thing the Director just granted them.
//
// So the page opens, and the one authority on the rule — Lane S3's
// `fn_onemark_source_analytics`, which checks both halves — decides. Its refusal
// comes back as a 403 with its reason and renders as an explicit access page,
// never a silent redirect and never an empty table (CLAUDE.md #27).

import { usePermissions } from '@/hooks/use-permissions';
import { PermissionError } from '@/components/errors/permission-error';
import { Skeleton } from '@/components/ui/skeleton';
import { FoundationHeader } from '../../../_components/foundation-header';
import { SourceAnalyticsView } from './_components/source-analytics-view';

export default function OneMarkSourceResultsPage() {
  const { isLoading, userProfile } = usePermissions();

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-8">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (!userProfile?.id) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 md:px-8">
        <PermissionError
          message="Sign in to read the evidence on where OneMark questions come from."
          requiredPermission="foundation.assessments.manage"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 md:px-8">
      <FoundationHeader
        title="OneMark — did each source earn its place?"
        subtitle="A source has proved itself only when both halves hold: its questions turned up in the real board paper, and the learners who practised it did better. Neither number alone settles anything, so both are here, with what each one can and cannot claim."
        crumbs={[
          { label: 'Foundation', href: '/foundation' },
          { label: 'OneMark', href: '/foundation/onemark' },
          { label: 'Sources', href: '/foundation/onemark/sources' },
          { label: 'Evidence' },
        ]}
      />
      <SourceAnalyticsView />
    </div>
  );
}
