'use client';

// ============================================================================
// /director-desk — everything the Director has handed out, and what is not green.
//
// Spec: specs/director-desk/SPEC.md (PR 4 of 5). Gated on
// director.handover.view_all via MENU_PERMISSIONS + the subtree layout guard.
//
// WHAT THIS PAGE IS FOR
// ---------------------
// The Director hands out work. Weeks later the only honest question is: which of
// these has stopped moving, and what do I do about each one? Decision 12 names
// four separate ways an item stops being green, and each one has a DIFFERENT
// next move — chase, ask, reassign, reassign urgently. So this page never shows
// a single "late" number. It shows four, each in its own colour, each labelled
// with the action it implies.
//
// WHERE RED IS DECIDED
// --------------------
// Not here. fn_director_handover_board() (migration 20260811130000) computes the
// four rules in SQL and returns, per row, the most urgent rule plus every rule
// that fired. The nightly chase engine (PR 5) reads the same function. That is
// deliberate: if the board and the chase engine each had their own idea of red,
// the Director would get a nudge sent about an item his screen calls green, and
// no way to tell which was lying.
//
// This file only counts and colours what SQL already decided.
//
// THE COUNTS ADD UP
// -----------------
// An item routinely breaks two or three rules at once. The strip at the top
// counts each item ONCE, under its most urgent rule, so the four numbers sum
// exactly to the not-green total. The extra rules an item breaks are shown on
// the item itself, not in the counts.
// ============================================================================

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Inbox, RefreshCw } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionError } from '@/components/errors';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/hooks/use-permissions';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { cn } from '@/lib/utils';

import { HandoverCard } from './_components/handover-card';
import {
  NOT_GREEN_RULES,
  type HandoverBoardRow,
  type NotGreenReason
} from './_lib/not-green';

const VIEW_KEY = 'director.handover.view_all';

type Filter = 'all' | 'not_green' | NotGreenReason;

function useHandoverBoard() {
  return useQuery({
    queryKey: ['director-desk', 'board'],
    queryFn: async (): Promise<HandoverBoardRow[]> => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any).rpc('fn_director_handover_board');
      if (error) {
        logger.error('director-desk', 'board query failed', error);
        throw error;
      }
      // An empty board and a board the caller may not read look identical over
      // the wire (RLS denial is silent). The RPC is SECURITY DEFINER precisely so
      // that cannot happen here: an empty array really does mean nothing is out.
      return (data ?? []) as HandoverBoardRow[];
    },
    staleTime: 60 * 1000
  });
}

export default function DirectorDeskPage() {
  const { can, isSuperAdmin, isLoading: permLoading } = usePermissions();
  const allowed = isSuperAdmin || can(VIEW_KEY);

  const { data, isLoading, isFetching, isError, error, refetch } = useHandoverBoard();
  const [filter, setFilter] = useState<Filter>('all');

  const rows = useMemo(() => data ?? [], [data]);

  const counts = useMemo(() => {
    const byReason = { owner_gone: 0, overdue: 0, never_accepted: 0, quiet: 0 } as Record<
      NotGreenReason,
      number
    >;
    let notGreen = 0;
    let live = 0;
    for (const row of rows) {
      if (row.is_live) live += 1;
      if (row.not_green_reason) {
        notGreen += 1;
        byReason[row.not_green_reason] += 1;
      }
    }
    return { total: rows.length, live, notGreen, green: rows.length - notGreen, byReason };
  }, [rows]);

  const visible = useMemo(() => {
    if (filter === 'all') return rows;
    if (filter === 'not_green') return rows.filter((r) => r.not_green_reason !== null);
    return rows.filter((r) => r.not_green_reason === filter);
  }, [rows, filter]);

  if (permLoading) {
    return (
      <ContentLayout>
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      </ContentLayout>
    );
  }

  if (!allowed) {
    return (
      <ContentLayout>
        <PermissionError
          message="The Director's desk shows every job that has been handed out across the institution. Ask the Director if you need it."
          requiredPermission={VIEW_KEY}
        />
      </ContentLayout>
    );
  }

  return (
    <ContentLayout>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Director&apos;s Desk</h1>
          <p className="text-sm text-muted-foreground">
            Everything you have handed out, and what has stopped moving.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', isFetching && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {isError ? (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>The desk could not be loaded</AlertTitle>
          <AlertDescription>
            {(error as any)?.message ?? 'Unknown error'} — nothing on this page is safe to act on
            until it loads. Try Refresh.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* ---- the counts strip ------------------------------------------- */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <CountTile
          label="Open items"
          sub="on your desk"
          value={counts.total}
          active={filter === 'all'}
          onClick={() => setFilter('all')}
          loading={isLoading}
        />
        <CountTile
          label="Access still open"
          sub="someone can act today"
          value={counts.live}
          loading={isLoading}
        />
        <CountTile
          label="Not green"
          sub="needs you"
          value={counts.notGreen}
          tone={counts.notGreen > 0 ? 'alert' : 'ok'}
          active={filter === 'not_green'}
          onClick={() => setFilter('not_green')}
          loading={isLoading}
        />
        {NOT_GREEN_RULES.map((rule) => (
          <CountTile
            key={rule.reason}
            label={rule.label}
            sub={rule.action.toLowerCase()}
            value={counts.byReason[rule.reason]}
            dotClass={rule.dotClass}
            active={filter === rule.reason}
            onClick={() => setFilter(rule.reason)}
            loading={isLoading}
          />
        ))}
      </div>

      <p className="mb-4 text-xs text-muted-foreground">
        Each item is counted once, under the most urgent rule it breaks — so the four numbers add
        up to &ldquo;not green&rdquo;. Anything else an item breaks is written on the item.
      </p>

      {/* ---- the board --------------------------------------------------- */}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">Nothing is out with anyone.</p>
              <p className="text-sm text-muted-foreground">
                Hand a page over from that page&apos;s own screen and it will appear here.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/my-desk">See what has been handed to you</Link>
            </Button>
          </CardContent>
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <p className="font-medium">Nothing in this bucket.</p>
            <Button variant="outline" size="sm" onClick={() => setFilter('all')}>
              Show everything
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((row) => (
            <HandoverCard key={row.id} row={row} onChanged={() => refetch()} />
          ))}
        </div>
      )}
    </ContentLayout>
  );
}

function CountTile({
  label,
  sub,
  value,
  dotClass,
  tone,
  active,
  onClick,
  loading
}: {
  label: string;
  sub: string;
  value: number;
  dotClass?: string;
  tone?: 'alert' | 'ok';
  active?: boolean;
  onClick?: () => void;
  loading?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-center gap-1.5">
        {dotClass ? <span className={cn('h-2 w-2 rounded-full', dotClass)} aria-hidden /> : null}
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="mt-1 h-7 w-10" />
      ) : (
        <span
          className={cn(
            'text-2xl font-semibold tabular-nums',
            tone === 'alert' && 'text-red-600 dark:text-red-400',
            tone === 'ok' && 'text-emerald-600 dark:text-emerald-400'
          )}
        >
          {value}
        </span>
      )}
      <span className="text-[11px] text-muted-foreground">{sub}</span>
    </>
  );

  const className = cn(
    'flex flex-col items-start rounded-lg border p-3 text-left transition-colors',
    onClick && 'hover:bg-muted/50',
    active && 'border-foreground/40 bg-muted/60'
  );

  if (!onClick) {
    return <div className={className}>{body}</div>;
  }

  return (
    <button type="button" onClick={onClick} className={className} aria-pressed={!!active}>
      {body}
    </button>
  );
}
