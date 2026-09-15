'use client';

// OneMark — record what appeared in the real board paper.
//
// Half of Director ruling (a) of 2026-09-06: a source "worked" only if BOTH its
// questions appeared in the real paper AND learners who practised it did
// better. Nothing measures the first half except a person reading the printed
// paper next to the bank and ticking what turned up — so this screen exists,
// and it is used once a year, after each real exam.
//
// Gate: `foundation.items.manage`. A refusal renders an explicit page with the
// reason, never a silent redirect (CLAUDE.md #27).

import { usePermissions } from '@/hooks/use-permissions';
import { PermissionError } from '@/components/errors/permission-error';
import { Skeleton } from '@/components/ui/skeleton';
import { FoundationHeader } from '../../../_components/foundation-header';
import { BoardPaperTagger } from './_components/board-paper-tagger';

export default function OneMarkBoardPaperPage() {
  const { isLoading, canAccess, userProfile } = usePermissions();

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 md:px-8">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!canAccess('foundation', 'items.manage') || !userProfile?.id) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 md:px-8">
        <PermissionError
          message="Only a Senior Learner who manages the OneMark question bank can record what appeared in the real board paper."
          requiredPermission="foundation.items.manage"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-6 md:px-8">
      <FoundationHeader
        title="OneMark — what turned up in the board paper"
        subtitle="Read the printed paper next to the bank and tick each of our questions that appeared — the same question, or the same idea asked in different words. These ticks are the only evidence the hit rate ever has, so record them once, honestly, after each real exam."
        crumbs={[
          { label: 'Foundation', href: '/foundation' },
          { label: 'OneMark', href: '/foundation/onemark' },
          { label: 'Sources', href: '/foundation/onemark/sources' },
          { label: 'Board paper' },
        ]}
      />
      <BoardPaperTagger userId={userProfile.id} />
    </div>
  );
}
