'use client';

// OneMark — the school unit list, subject first.
//
// Director ruling 2026-09-06: "the units are not organized as per subject wise.
// It needs to be a greater user interface and user experience."
//
// Before this screen the only place a OneMark unit appeared as a row was
// /cdc/admin/exam-topic-map — a government-coaching grid whose columns are
// TNPSC / RRB / IBPS / SBI / SSC. The 18 school units sat there as rows with
// nothing to tick, because neither OneMark subject is a column on that grid.
// This screen is where they live now, one section per subject, each ordered by
// its own position in that subject's unit list.
//
// Gate: foundation.items.manage — the same key that opens the review queue,
// because adding or retiring a unit changes what a question can be written
// against. A denial renders an explicit 403, never a silent redirect
// (CLAUDE.md #27).

import { usePermissions } from '@/hooks/use-permissions';
import { PermissionError } from '@/components/errors/permission-error';
import { Skeleton } from '@/components/ui/skeleton';
import { FoundationHeader } from '../../_components/foundation-header';
import { UnitsBoard } from './_components/units-board';

export default function OneMarkUnitsPage() {
  const { isLoading, canAccess } = usePermissions();

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 md:px-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!canAccess('foundation', 'items.manage')) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 md:px-8">
        <PermissionError
          message="Only a subject Senior Learner who manages the question bank can edit the OneMark unit list."
          requiredPermission="foundation.items.manage"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-6 md:px-8">
      <FoundationHeader
        title="OneMark — unit list"
        subtitle="Every unit of every OneMark subject, in the order the board teaches it. Add a unit, rename one, move it within its subject, or retire one that is no longer taught."
        crumbs={[{ label: 'Foundation', href: '/foundation' }, { label: 'OneMark units' }]}
      />
      <UnitsBoard />
    </div>
  );
}
