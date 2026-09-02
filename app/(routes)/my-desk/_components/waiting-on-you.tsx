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
// fn_my_desk_waiting() (migration 20261018020000, zero arguments, scoped on
// auth.uid(), ORDER BY waiting_since ASC, LIMIT 500) does the whole
// computation — which hires are pinned to me, which refunds, which leave
// requests, which meeting triggers, which grievances — and returns them
// already ordered oldest-first. Nothing here re-derives a queue, and the five
// queues it covers are named in the sentence it prints when the answer is
// empty, so "nothing waiting" always says what was looked at.
//
// A FAILED CALL IS NOT AN EMPTY DESK — AND NEITHER IS A PAUSED ONE
// ----------------------------------------------------------------
// The section may say "nothing waiting" ONLY off a call that SUCCEEDED and
// returned a list. Which branch renders is decided by renderState() in
// ../_lib/waiting.ts, keyed on query.status / fetchStatus / data — NOT on
// isLoading, which is false for a paused (offline) fetch and would have let
// an iPhone with no signal read "nothing waiting". Order: error → no answer
// yet (paused, or the skeleton) → empty → rows. A payload that is not a list
// throws in the queryFn, so it lands in the error branch too.
//
// ONE CLOCK
// ---------
// Every age shown — chip, order, "oldest" — comes from waiting_since against
// the moment the answer arrived (query.dataUpdatedAt), the same stamp the
// "checked HH:MM" reads. The RPC's own age_days is a fallback only.
//
// READ ON A PHONE
// ---------------
// The person this is for reads it on an iPhone at 387px wide. Single column,
// no table, tap targets no shorter than 40px, nothing clipped.
// ============================================================================

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowUpRight, Clock, Inbox, WifiOff } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { createClientSupabaseClient } from '@/lib/supabase/client';

import {
  ageChipClasses,
  ageTone,
  ageWords,
  countWords,
  describeError,
  emptyVerdict,
  formatRupees,
  groupBySource,
  renderState,
  rowAgeDays,
  safeHref,
  sourceWords,
  summaryLine,
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
      // A non-list answer is not "nothing waiting" either — it is a shape
      // this page does not understand, and it is reported as such.
      if (res.data !== null && res.data !== undefined && !Array.isArray(res.data)) {
        throw new Error('unexpected shape — the answer was not a list');
      }
      const rows = Array.isArray(res.data) ? res.data : [];
      return rows as WaitingRow[];
    },
    staleTime: WAITING_STALE_MS,
    retry: false,
  });
}

function AgeChip({ ageDays }: { ageDays: number | null }) {
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

function WaitingItem({ row, now }: { row: WaitingRow; now: number }) {
  const words = sourceWords(row.source);
  const href = safeHref(row.href);
  return (
    <li className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <AgeChip ageDays={rowAgeDays(row, now)} />
        {typeof row.amount === 'number' ? (
          <span className="text-sm font-semibold tabular-nums">{formatRupees(row.amount)}</span>
        ) : null}
      </div>
      <h4 className="mt-2 break-words text-sm font-semibold">{row.title}</h4>
      {row.detail ? (
        <p className="mt-0.5 break-words text-xs text-muted-foreground">{row.detail}</p>
      ) : null}
      {href ? (
        // Full width on a phone so the whole row is the tap target; 40px tall by design.
        <Button asChild variant="outline" className="mt-3 min-h-10 w-full sm:w-auto">
          <Link href={href} aria-label={`Open — ${words.verb}: ${row.title}`}>
            Open
            <ArrowUpRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      ) : (
        // Only an in-app path is ever linked. A row without one is still
        // listed — it is still waiting — but it gets no button.
        <p className="mt-3 text-xs text-muted-foreground">no page</p>
      )}
    </li>
  );
}

export function WaitingOnYou({ userId }: { userId: string | undefined }) {
  const query = useWaitingOnYou(userId);
  const state = renderState(query);
  const rows = useMemo<WaitingRow[]>(
    () => (Array.isArray(query.data) ? query.data : []),
    [query.data],
  );
  const groups = useMemo(() => groupBySource(rows), [rows]);

  // React Query stamps this when the answer arrived. It is the one clock: the
  // "checked HH:MM" stamp and every age on the page read from it. It is only
  // read in the branches that render an answer, so it is never the 0 it
  // holds before one.
  const checkedAt = query.dataUpdatedAt;

  return (
    <Card className="border-indigo-200 bg-indigo-50/40 dark:border-indigo-900/40 dark:bg-indigo-950/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Inbox className="h-6 w-6 text-indigo-600" />
          Waiting on you
          {state === 'rows' ? <Badge variant="secondary">{countWords(rows)}</Badge> : null}
        </CardTitle>
        {state === 'rows' ? (
          <p className="text-sm text-muted-foreground">{summaryLine(rows, checkedAt)}</p>
        ) : null}
      </CardHeader>
      <CardContent>
        {state === 'error' ? (
          // Never an empty list on a failed read.
          <div className="flex items-start gap-3 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <div>
              <p className="font-medium">
                {emptyVerdict({
                  kind: 'error',
                  reason: describeError(
                    query.error ?? 'the answer arrived in a shape this page does not understand',
                  ),
                })}
              </p>
              <p className="text-muted-foreground">
                This is a loading problem, not a statement that nothing is waiting on you.
                Reload the page; if it keeps happening, the queues can still be opened from
                their own modules.
              </p>
            </div>
          </div>
        ) : state === 'paused' ? (
          // Offline: no answer has arrived and none is on its way until the
          // connection is back. Not the skeleton (nothing is loading) and
          // above all not the all-clear.
          <div className="flex items-start gap-3 text-sm" role="status">
            <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="font-medium">
              Waiting for a connection to check what is waiting on you
            </p>
          </div>
        ) : state === 'loading' ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : state === 'empty' ? (
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
                    {group.rows.map((row, i) => (
                      <WaitingItem
                        key={`${group.source}:${row.item_id ?? i}`}
                        row={row}
                        now={checkedAt}
                      />
                    ))}
                  </ol>
                </section>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
