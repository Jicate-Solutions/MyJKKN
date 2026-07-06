'use client';

/**
 * Feeder quick-preview dialog — a lightweight roster popup for an un-adopted
 * feeder school. Shows the learners the admission database recorded as coming
 * from this school (all name spellings, all admission years). It is opened from
 * inside a per-level FeederSection, so `level` scopes the roster to that
 * section's programme level — the popup count then matches the feeder row it
 * was opened from (the "roster == panel enrolled_count" invariant). Reads live
 * through listSchoolLearners → /api/schools-network/school-learners; nothing is
 * copied. The single action, "Adopt this school", hands off to the pre-filled
 * Add-School form (the only place a school becomes JKKN-side writable).
 */

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

import { listSchoolLearners, type SchoolLearnerRow } from '../_lib/api';

// This is a fast-glance popup, not the full roster. Un-adopted schools have no
// detail page, so there is nowhere to "open the full list" — that lives on the
// Enrolled Learners tab which only appears AFTER adoption. Cap the fetch here
// and point the user at the Adopt button for the searchable roster.
const PREVIEW_LIMIT = 25;

export function FeederPreviewDialog(props: {
  schoolName: string;
  /** Programme level of the FeederSection this popup opened from. Scopes the
   *  roster so its count matches the clicked row (undefined → all levels). */
  level?: 'ug' | 'pg' | 'other';
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  const { schoolName, level, open, onOpenChange } = props;

  // Dormant until the popup actually opens — lets the parent mount one dialog
  // per un-adopted row without firing N roster requests up front.
  const { data, isLoading } = useQuery({
    queryKey: [
      'schools-network',
      'preview-learners',
      schoolName,
      level ?? 'all',
      `first${PREVIEW_LIMIT}`,
    ],
    queryFn: () => listSchoolLearners(schoolName, { level, limit: PREVIEW_LIMIT }),
    enabled: open && !!schoolName,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  // `total` is the full count; only up to PREVIEW_LIMIT rows load here.
  const hasMore = total > PREVIEW_LIMIT;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="break-words pr-6">{schoolName}</DialogTitle>
          <DialogDescription>
            {isLoading
              ? 'Loading learners recorded from this school…'
              : `${total.toLocaleString('en-IN')} learner${
                  total === 1 ? '' : 's'
                } came from this school, across all admission years.`}
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 max-h-[60vh] overflow-y-auto px-1">
          {isLoading ? (
            <div className="space-y-2 py-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : total === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No learners recorded from this school yet.
            </p>
          ) : (
            <ul className="divide-y">
              {rows.map((r: SchoolLearnerRow) => (
                <li key={r.learnerId} className="py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">
                      {r.learnerName ?? '—'}
                    </span>
                    {r.registerNumber ? (
                      <span className="whitespace-nowrap text-xs text-muted-foreground">
                        {r.registerNumber}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{r.programName ?? '—'}</span>
                    {r.yearKnown ? (
                      <span className="whitespace-nowrap">· {r.admissionYear}</span>
                    ) : (
                      <Badge
                        variant="secondary"
                        className="text-[10px] font-normal"
                      >
                        Year not recorded
                      </Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!isLoading && hasMore ? (
          <p className="px-1 text-xs text-muted-foreground">
            Showing the first {PREVIEW_LIMIT} of{' '}
            {total.toLocaleString('en-IN')}. Adopt this school to see the full,
            searchable roster.
          </p>
        ) : null}

        <DialogFooter>
          <Link
            href={`/admission/schools-network/new?name=${encodeURIComponent(
              schoolName,
            )}`}
            className="w-full sm:w-auto"
          >
            <Button className="w-full gap-1.5">
              <Plus className="h-4 w-4" /> Adopt this school
            </Button>
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
