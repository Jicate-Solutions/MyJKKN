'use client';

// ============================================================================
// "Waiting on you" — the top of /my-desk.
//
// Everything the database has computed to be waiting on the signed-in person,
// oldest first, with one Open button per row that goes to the module page
// where the action already exists. This section writes nothing: the deciding
// stays where it always was, on the module's own page.
//
// ONE READ, ONE FUNCTION
// ----------------------
// fn_my_desk_waiting() does the whole computation — which hires are pinned to
// me, which refunds, which leave requests, which meeting triggers, which
// grievances — and returns them already ordered oldest-first. Nothing here
// re-derives a queue, and the five queues it covers are named in the sentence
// it prints when the answer is empty, so "nothing waiting" always says what
// was looked at.
//
// A FAILED CALL IS NOT AN EMPTY DESK
// ----------------------------------
// The function may not exist yet on the database this page is talking to (it
// ships in its own migration). PostgREST reports that as an error, and this
// section shows "Could not check what is waiting on you" with the reason —
// never a clean empty list, which would be this page telling the Director he
// has nothing to decide off a request that never counted anything.
//
// READ ON A PHONE
// ---------------
// The person this is for reads it on an iPhone at 387px wide. Single column,
// no table, tap targets no shorter than 40px, nothing clipped.
// ============================================================================

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowUpRight, Clock, Inbox } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { createClientSupabaseClient } from '@/lib/supabase/client';

import {
  ageChipClasses,
  ageTone,
  ageWords,
  describeError,
  emptyVerdict,
  formatRupees,
  groupBySource,
  isCapped,
  sourceWords,
  summaryLine,
  WAITING_ROW_CAP,
  WAITING_STALE_MS,
  type WaitingRow,
} from '../_lib/waiting';

/** Same prefix as every other read on /my-desk, so the page's one clear clears this too. */
const QK = ['director-desk', 'my-desk', 'waiting'] as const;

export function useWaitingOnYou(userId: string | undefined) {
  return useQuery({
    queryKey: [...QK, userId],
    enabled: !!userId,
    queryFn: async (): Promise<WaitingRow[]> => {
      const sb = createClientSupabaseClient() as any;
      const res = await sb.rpc('fn_my_desk_waiting');
      // Thrown, not swallowed: an error must reach the "could not check"
      // branch below, never the empty list.
      if (res.error) throw new Error(res.error.message ?? String(res.error));
      return (res.data ?? []) as WaitingRow[];
    },
    staleTime: WAITING_STALE_MS,
    retry: false,
  });
}

function AgeChip({ ageDays }: { ageDays: number }) {
  const tone = ageTone(ageDays);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${ageChipClasses(tone)}`}
    >
      <Clock className="h-3 w-3" />
      {ageWords(ageDays)}
    </span>
  );
}

function WaitingItem({ row }: { row: WaitingRow }) {
  const words = sourceWords(row.source);
  return (
    <li className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <AgeChip ageDays={row.age_days} />
        {row.amount !== null && row.amount !== undefined ? (
          <span className="text-sm font-semibold tabular-nums">{formatRupees(row.amount)}</span>
        ) : null}
      </div>
      <h4 className="mt-2 break-words text-sm font-semibold">{row.title}</h4>
      {row.detail ? (
        <p className="mt-0.5 break-words text-xs text-muted-foreground">{row.detail}</p>
      ) : null}
      {/* Full width on a phone so the whole row is the tap target; 40px tall by design. */}
      <Button asChild variant="outline" className="mt-3 min-h-10 w-full sm:w-auto">
        <Link href={row.href} aria-label={`Open — ${words.verb}: ${row.title}`}>
          Open
          <ArrowUpRight className="ml-1 h-4 w-4" />
        </Link>
      </Button>
    </li>
  );
}

export function WaitingOnYou({ userId }: { userId: string | undefined }) {
  const query = useWaitingOnYou(userId);
  const rows = useMemo(() => query.data ?? [], [query.data]);
  const groups = useMemo(() => groupBySource(rows), [rows]);

  // The page's own sign-in guard already stops rendering before here; this is
  // the same rule again so the component cannot be dropped somewhere it should
  // not read from.
  if (!userId) return null;

  // React Query stamps this when the answer arrived; it is only read in the
  // branches that render an answer, so it is never the 0 it holds before one.
  const checkedAt = query.dataUpdatedAt;

  return (
    <Card className="border-indigo-200 bg-indigo-50/40 dark:border-indigo-900/40 dark:bg-indigo-950/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Inbox className="h-6 w-6 text-indigo-600" />
          Waiting on you
          {!query.isLoading && !query.error && rows.length > 0 ? (
            <Badge variant="secondary">{rows.length}</Badge>
          ) : null}
        </CardTitle>
        {!query.isLoading && !query.error && rows.length > 0 ? (
          <p className="text-sm text-muted-foreground">{summaryLine(rows, checkedAt)}</p>
        ) : null}
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : query.error ? (
          // Never an empty list on a failed read.
          <div className="flex items-start gap-3 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <div>
              <p className="font-medium">
                {emptyVerdict({ kind: 'error', reason: describeError(query.error) })}
              </p>
              <p className="text-muted-foreground">
                This is a loading problem, not a statement that nothing is waiting on you.
                Reload the page; if it keeps happening, the queues can still be opened from
                their own modules.
              </p>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {emptyVerdict({ kind: 'empty', checkedAt })}
          </p>
        ) : (
          <div className="space-y-5">
            {groups.map((group) => {
              const words = sourceWords(group.source);
              return (
                <section key={group.source} aria-label={words.label}>
                  <h3 className="mb-2 flex items-center gap-2 text-base font-semibold">
                    {words.label}
                    <Badge variant="outline">{group.rows.length}</Badge>
                  </h3>
                  <ol className="space-y-2">
                    {group.rows.map((row) => (
                      <WaitingItem key={`${row.source}:${row.item_id}`} row={row} />
                    ))}
                  </ol>
                </section>
              );
            })}
            {isCapped(rows) ? (
              <p className="text-xs text-muted-foreground">
                Showing the first {WAITING_ROW_CAP}. More than this is waiting on you than the
                page is reading.
              </p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
