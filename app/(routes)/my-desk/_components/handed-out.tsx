'use client';

// ============================================================================
// "Handed out by me" — the SENDING half, on /my-desk.
//
// /my-desk answers "what has been handed to me". Everyone who hands work out
// then arrives here expecting the other half — who did I send it to, where,
// when is it due, and are they actually doing it — and finds nothing, because
// that half lives on /director-desk. This section puts both questions on the
// one page somebody actually opens.
//
// WHY THIS READS TWICE, AND WHY THE SECOND READ IS NOT OPTIONAL
// -------------------------------------------------------------
// fn_director_handover_board() already computes every field this needs —
// grantee name, due date, days remaining, days quiet, the last note, and which
// of the five "not green" rules fired. But it does NOT return granted_by, and
// its own WHERE is
//
//     dh.granted_by = auth.uid()  OR  (fn_director_handover_sees_all() AND …)
//
// so for a SUPER ADMIN it also returns handovers other people sent. Rendering
// that under a heading reading "handed out by me" would be a lie about who is
// accountable for the item. Adding granted_by to the RPC is not the cheap fix
// it looks like: changing a RETURNS TABLE shape needs DROP + CREATE, not
// CREATE OR REPLACE, on a function other surfaces already call.
//
// So the ids come from a one-column read of director_handovers, whose RLS
// already admits `granted_by = auth.uid()`, and the board is narrowed to that
// set. Two cheap reads, no migration, and the heading stays true for everyone.
//
// AUTO-REFRESH
// ------------
// The board refetches on an interval so an item's state moves while the page is
// open — that is the whole point of the section. `refetchIntervalInBackground`
// is deliberately left false: a desk nobody is looking at should not poll.
// ============================================================================

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, CircleAlert, Clock, UserRound } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { createClientSupabaseClient } from '@/lib/supabase/client';

import { describeDue, type AuditRow, type DeskPerson } from '../_lib/desk';
import { Trail } from './trail';

/** How often the board re-reads while somebody is watching the page. */
export const HANDED_OUT_REFETCH_MS = 30 * 1000;

/** Explicit, so a short answer is OUR cap rather than an unreadable truncation. */
export const HANDED_OUT_LIMIT = 200;

/**
 * One row of the board, narrowed to the columns this section renders. The RPC
 * returns 23; naming the ones used here keeps a column rename loud instead of
 * silently rendering undefined.
 */
export interface SentRow {
  id: string;
  route: string;
  title: string;
  status: string;
  access_level: string;
  grantee_user_id: string | null;
  grantee_name: string | null;
  grantee_email: string | null;
  grantee_is_active: boolean | null;
  due_date: string | null;
  days_remaining: number | null;
  days_quiet: number | null;
  last_note: string | null;
  last_grantee_activity_at: string | null;
  is_live: boolean | null;
  not_green_reason: string | null;
}

export interface HandedOutResult {
  rows: SentRow[];
  /** The read hit its ceiling — some of your sent work is not on screen. */
  capped: boolean;
}

/**
 * What I handed out. See the header for why this is two reads rather than one.
 */
export function useHandedOutByMe(userId: string | undefined) {
  return useQuery({
    queryKey: ['director-desk', 'my-desk', 'handed-out', userId],
    enabled: !!userId,
    queryFn: async (): Promise<HandedOutResult> => {
      const sb = createClientSupabaseClient() as any;

      // 1. The ids that are genuinely mine. RLS on director_handovers already
      //    admits granted_by = auth.uid(), so this needs no permission key —
      //    a HOD who handed one page to a colleague sees their one item.
      const mine = await sb
        .from('director_handovers')
        .select('id')
        .eq('granted_by', userId)
        .limit(HANDED_OUT_LIMIT);
      if (mine.error) throw new Error(mine.error.message);

      const mineIds = new Set<string>(((mine.data ?? []) as { id: string }[]).map((r) => r.id));
      if (mineIds.size === 0) return { rows: [], capped: false };

      // 2. The enriched board, narrowed to those ids. Everything rendered below
      //    — the due maths, the quiet count, the last note, the not-green rule —
      //    is decided in SQL by fn_director_handover_board, not recomputed here.
      const board = await sb.rpc('fn_director_handover_board');
      if (board.error) throw new Error(board.error.message);

      const rows = ((board.data ?? []) as SentRow[]).filter((r) => mineIds.has(r.id));

      return {
        rows,
        capped: mineIds.size >= HANDED_OUT_LIMIT,
      };
    },
    staleTime: 15 * 1000,
    refetchInterval: HANDED_OUT_REFETCH_MS,
    // A desk nobody is looking at should not poll.
    refetchIntervalInBackground: false,
    retry: false,
  });
}

/** Colour for the due date. Mirrors describeDue's own three tones. */
function dueClasses(tone: 'past' | 'soon' | 'calm'): string {
  if (tone === 'past') return 'text-destructive';
  if (tone === 'soon') return 'text-amber-600 dark:text-amber-500';
  return 'text-muted-foreground';
}

function SentItem({
  row,
  todayIso,
  entries,
  people,
  trailUnavailable,
}: {
  row: SentRow;
  todayIso: string;
  entries: AuditRow[];
  people: Record<string, DeskPerson> | undefined;
  trailUnavailable: boolean;
}) {
  const due = describeDue(row.due_date, todayIso);
  const to = row.grantee_name ?? row.grantee_email ?? 'someone whose name we could not load';

  return (
    <li className="rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold">{row.title}</h4>
          <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <UserRound className="h-3.5 w-3.5" />
            To <span className="font-medium text-foreground">{to}</span>
            {row.grantee_email && row.grantee_name ? <span>· {row.grantee_email}</span> : null}
            {row.grantee_is_active === false ? (
              <Badge variant="destructive" className="ml-1">
                their account is switched off
              </Badge>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={row.status === 'accepted' ? 'default' : 'secondary'}>{row.status}</Badge>
          <Badge variant="outline">{row.access_level}</Badge>
        </div>
      </div>

      {/* Where the work is, and the deadline — both were already fetched and
          neither was ever shown. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <Link href={row.route} className="inline-flex items-center gap-1 font-mono hover:underline">
          {row.route}
          <ArrowUpRight className="h-3 w-3" />
        </Link>
        {row.due_date ? (
          <span className={`inline-flex items-center gap-1 ${dueClasses(due.tone)}`}>
            <Clock className="h-3.5 w-3.5" />
            Due {new Date(`${row.due_date}T00:00:00Z`).toLocaleDateString()} · {due.label}
          </span>
        ) : (
          <span className="text-muted-foreground">no due date</span>
        )}
      </div>

      {/* Are they working on it. days_quiet counts the GRANTEE's own audit rows,
          so your own nudge cannot make this look healthy. */}
      <div className="mt-2 text-xs">
        {row.days_quiet === null ? (
          <span className="text-muted-foreground">They have not touched it yet.</span>
        ) : row.days_quiet === 0 ? (
          <span className="text-muted-foreground">Heard from them today.</span>
        ) : (
          <span className="text-muted-foreground">
            Last heard from them {row.days_quiet}d ago.
          </span>
        )}
        {row.last_note ? (
          <p className="mt-1 border-l-2 pl-2 italic text-foreground">“{row.last_note}”</p>
        ) : null}
      </div>

      {row.not_green_reason ? (
        <p className="mt-2 inline-flex items-center gap-1 text-xs text-destructive">
          <CircleAlert className="h-3.5 w-3.5" />
          {row.not_green_reason}
        </p>
      ) : null}

      <div className="mt-2">
        <Trail entries={entries} people={people} unavailable={trailUnavailable} />
      </div>
    </li>
  );
}

export function HandedOutByMe({
  result,
  isLoading,
  error,
  todayIso,
  trails,
  people,
  trailsUnavailable,
}: {
  result: HandedOutResult | undefined;
  isLoading: boolean;
  error: unknown;
  todayIso: string;
  /** handover_id -> its audit rows, newest first. */
  trails: Record<string, AuditRow[]>;
  people: Record<string, DeskPerson> | undefined;
  trailsUnavailable: boolean;
}) {
  const rows = useMemo(() => result?.rows ?? [], [result]);

  // Nothing handed out is the ordinary case for most people. Say nothing rather
  // than showing an empty box on every desk on the platform.
  if (!isLoading && !error && rows.length === 0) return null;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Handed out by me
          {rows.length > 0 ? <Badge variant="secondary">{rows.length}</Badge> : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : error ? (
          // Never an empty list on a failed read — that would be this page
          // telling you that you have handed nothing out, off a request that
          // never arrived.
          <p className="text-sm text-destructive">
            What you handed out could not be loaded. This does not mean you have handed
            nothing out.
          </p>
        ) : (
          <>
            <ol className="space-y-3">
              {rows.map((row) => (
                <SentItem
                  key={row.id}
                  row={row}
                  todayIso={todayIso}
                  entries={trails[row.id] ?? []}
                  people={people}
                  trailUnavailable={trailsUnavailable}
                />
              ))}
            </ol>
            {result?.capped ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Showing the first {HANDED_OUT_LIMIT}. You have handed out more than this page
                is reading.
              </p>
            ) : null}
            <p className="mt-3 text-xs text-muted-foreground">
              Updates on its own every {Math.round(HANDED_OUT_REFETCH_MS / 1000)}s while this
              page is open.
            </p>
            <div className="mt-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/director-desk">Open the full console</Link>
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
