'use client';

// Foundation — question bank review panel.
//
// Two lists, deliberately in that order:
//   1. Open reports — what a Senior Learner acts on. Dismiss (the question is
//      fine) or Mark fixed (it was wrong and has been corrected). Either one
//      puts the question back into mastery scoring on the next recompute.
//   2. The bank itself, each question carrying a "Report a problem" control.
//
// Why the panel exists: a batch of authored questions goes live after a random
// sample is read, not all of it. This is where the unread remainder gets caught.

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Flag, Loader2, ListChecks } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useItemFlags,
  useItems,
  useResolveItemFlag,
} from '@/hooks/foundation/use-foundation';
import type {
  ItemFlag,
  ItemFlagResolution,
} from '@/lib/services/foundation/foundation-service';
import { ItemFlagButton } from './item-flag-button';

interface ItemReviewPanelProps {
  examDefinitionId: string;
}

export function ItemReviewPanel({ examDefinitionId }: ItemReviewPanelProps) {
  const { canAccess, userProfile } = usePermissions();
  const canReview = canAccess('foundation', 'items.manage');
  // fp_items carries the answer keys, so reading the bank is permission-gated.
  // Someone may hold cohorts.view without it — they still see their own reports.
  const canSeeBank =
    canAccess('foundation', 'items.view') || canReview;
  const viewerId = userProfile?.id ?? null;

  const {
    data: items,
    isLoading: itemsLoading,
    isError: itemsError,
  } = useItems(canSeeBank ? examDefinitionId : null);

  // The exam filter reaches through an inner join on fp_items, so it would
  // silently drop the reports of anyone who cannot read the bank. Drop the
  // filter for them instead of dropping their rows.
  const { data: flags, isLoading: flagsLoading } = useItemFlags(
    canSeeBank ? { examDefinitionId } : {},
  );

  const openFlags = useMemo(
    () => (flags ?? []).filter((f) => f.status === 'open'),
    [flags],
  );

  /** item_id -> this viewer's own open report, so the control can say so. */
  const myOpenByItem = useMemo(() => {
    const m = new Map<string, ItemFlag>();
    for (const f of openFlags) {
      if (viewerId && f.flagged_by === viewerId) m.set(f.item_id, f);
    }
    return m;
  }, [openFlags, viewerId]);

  /** item_id -> how many open reports it carries, from anyone. */
  const openCountByItem = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of openFlags) {
      m.set(f.item_id, (m.get(f.item_id) ?? 0) + 1);
    }
    return m;
  }, [openFlags]);

  return (
    <div className="space-y-6">
      <OpenReports
        flags={openFlags}
        isLoading={flagsLoading}
        canReview={canReview}
      />

      {!canSeeBank ? null : (
      <div>
        <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <ListChecks className="h-3.5 w-3.5" />
          Question bank
          {items && items.length > 0 && (
            <span className="ml-1 font-mono tabular-nums">{items.length}</span>
          )}
        </h3>

        {itemsLoading ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : itemsError ? (
          // Never let a failed read read as "there is nothing here".
          <div className="rounded-xl border border-dashed border-destructive/40 p-8 text-center text-sm text-muted-foreground">
            The question bank could not be loaded. It was not empty — the read
            failed.
          </div>
        ) : !items || items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No questions in the bank for this exam yet.
          </div>
        ) : (
          <ul className="max-h-96 divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {items.map((it) => {
              const openCount = openCountByItem.get(it.id) ?? 0;
              return (
                <li
                  key={it.id}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-muted/40"
                >
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm text-foreground">
                      {it.stem}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">
                        D{it.difficulty ?? '?'}
                      </Badge>
                      {openCount > 0 && (
                        <Badge
                          variant="outline"
                          className="border-amber-400 text-[10px] text-amber-700 dark:text-amber-400"
                        >
                          <Flag className="mr-1 h-2.5 w-2.5" />
                          {openCount} open
                        </Badge>
                      )}
                    </span>
                  </span>
                  <ItemFlagButton
                    itemId={it.id}
                    existingFlag={myOpenByItem.get(it.id) ?? null}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Open reports
// ---------------------------------------------------------------------------

function OpenReports({
  flags,
  isLoading,
  canReview,
}: {
  flags: ItemFlag[];
  isLoading: boolean;
  canReview: boolean;
}) {
  if (isLoading) return <Skeleton className="h-28 w-full rounded-xl" />;

  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <Flag className="h-3.5 w-3.5" />
        Reported questions
        {flags.length > 0 && (
          <Badge variant="destructive" className="ml-1 text-[10px]">
            {flags.length} open
          </Badge>
        )}
      </h3>

      {flags.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nothing reported. Anyone signed in can report a question that looks
          wrong. A question only stops counting toward mastery scores once
          enough different people have reported the same one, and that change
          takes effect from the next recalculation.
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-amber-300/60 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/10">
          {flags.map((f) => (
            <ReportRow key={f.id} flag={f} canReview={canReview} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ReportRow({
  flag,
  canReview,
}: {
  flag: ItemFlag;
  canReview: boolean;
}) {
  const resolve = useResolveItemFlag();
  const [pending, setPending] = useState<ItemFlagResolution | null>(null);

  async function close(status: ItemFlagResolution) {
    setPending(status);
    try {
      await resolve.mutateAsync({ flagId: flag.id, status });
      toast.success(
        status === 'fixed'
          ? 'Marked fixed. It counts toward mastery again on the next recompute.'
          : 'Dismissed. It counts toward mastery again on the next recompute.',
      );
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not close the report');
    } finally {
      setPending(null);
    }
  }

  const raisedAt = flag.created_at
    ? new Date(flag.created_at).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
      })
    : null;

  return (
    <li className="space-y-2 px-4 py-3">
      <p className="line-clamp-2 text-sm font-medium text-foreground">
        {flag.item?.stem ?? 'Question no longer readable'}
      </p>
      {flag.reason && (
        <p className="text-xs text-muted-foreground">{flag.reason}</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {raisedAt && (
          <span className="text-[11px] text-muted-foreground">
            Reported {raisedAt}
          </span>
        )}
        {canReview && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={resolve.isPending}
              onClick={() => close('dismissed')}
            >
              {pending === 'dismissed' && (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              )}
              Dismiss
            </Button>
            <Button
              size="sm"
              className="h-7 bg-[#0b6d41] text-xs hover:bg-[#0a5c37]"
              disabled={resolve.isPending}
              onClick={() => close('fixed')}
            >
              {pending === 'fixed' && (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              )}
              Mark fixed
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}
