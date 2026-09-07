'use client';

// OneMark — the approver's queue.
//
// Every one-mark item enters the bank as a draft (is_active=false): lifted
// from a past board paper by scripts/onemark/ingest-board-paper.ts, or written
// by the AI drafting job. Nothing reaches a learner until ONE subject Senior
// Learner reads it here and ticks Approve (decision 7) — that flips is_active
// and stamps updated_by with the approver.
//
// Gate: foundation.items.manage (the bank holds answer keys). A denial renders
// an explicit 403, never a silent redirect (CLAUDE.md #27).

import { usePermissions } from '@/hooks/use-permissions';
import { PermissionError } from '@/components/errors/permission-error';
import { Skeleton } from '@/components/ui/skeleton';
import { FoundationHeader } from '../../_components/foundation-header';
import { DraftQueue } from './_components/draft-queue';

export default function OneMarkReviewPage() {
  const { isLoading, canAccess, userProfile } = usePermissions();

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 md:px-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (!canAccess('foundation', 'items.manage') || !userProfile?.id) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 md:px-8">
        <PermissionError
          message="Only a subject Senior Learner who manages the question bank can review OneMark drafts."
          requiredPermission="foundation.items.manage"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-6 md:px-8">
      <FoundationHeader
        title="OneMark — review drafts"
        subtitle="Read each draft against the paper it came from, fix what the extraction got wrong, set the answer and the JABT level, then tick it into the live bank."
        crumbs={[{ label: 'Foundation', href: '/foundation' }, { label: 'OneMark review' }]}
      />
      <DraftQueue userId={userProfile.id} />
    </div>
  );
}
