'use client';

// OneMark — manage the question sources.
//
// One screen, one list: where our questions come from. Any question author
// (`foundation.items.manage`) may add a source, rename it, move it in the list
// and retire it — Director ruling (b) of 2026-09-06. Nothing here can delete
// one, and the screen says why in the place a delete button would have been.
//
// Gate: `foundation.items.manage`. A refusal renders an explicit page with the
// reason, never a silent redirect (CLAUDE.md #27).

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { PermissionError } from '@/components/errors/permission-error';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FoundationHeader } from '../../_components/foundation-header';
import { SourcesTable } from './_components/sources-table';

export default function OneMarkSourcesPage() {
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
          message="Only a Senior Learner who manages the OneMark question bank can change where questions are recorded as coming from."
          requiredPermission="foundation.items.manage"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-6 md:px-8">
      <FoundationHeader
        title="OneMark — question sources"
        subtitle="Where each question came from: a textbook back exercise, a past board paper, a district revision paper, a model paper, or written in-house. Learners pick from this list when they practise, and it is what the evidence screen judges after the real board paper."
        crumbs={[
          { label: 'Foundation', href: '/foundation' },
          { label: 'OneMark', href: '/foundation/onemark' },
          { label: 'Sources' },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/foundation/onemark/sources/board-paper">
                Record board-paper matches
                <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/foundation/onemark/results/sources">
                See the evidence
                <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        }
      />
      <SourcesTable />
    </div>
  );
}
