'use client';

/**
 * MBA Associate Dashboard — client surface.
 *
 * Two panels, both built ENTIRELY from data the viewer can already see through
 * board RLS — no new institutional data is exposed:
 *
 *   1. "Your contribution" — the signed-in Associate's OWN ideas broken down by
 *      status, their combined score, and their rank on the impact leaderboard.
 *      Keyed on author_id === currentUserId.
 *   2. "Board pulse" — aggregate, non-sensitive counts of the ideas the viewer
 *      can see (open ideas by status + by area across the program). Sensitive
 *      ideas are already withheld by RLS before they reach this component.
 *
 * Data comes from two existing RLS-scoped service reads — ImprovementService
 * .listIdeas() (every idea the viewer may see) and .leaderboard() (ranked
 * contributors) — so there is no new RPC and no new data surface to lock down.
 * The gate on improvement.ideas.view is enforced client-side via usePermissions
 * (an explicit no-access panel, never a silent redirect — CLAUDE.md #27).
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Lightbulb,
  Plus,
  Trophy,
  ArrowRight,
  ShieldAlert,
  Activity,
  BadgeCheck,
  LayoutGrid,
  FileWarning
} from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import {
  ImprovementService,
  type ImprovementIdeaEnriched,
  type ImprovementIdeaStatus,
  type ImprovementLeaderboardEntry
} from '@/lib/services/improvement/improvement-service';
import {
  MbaDataGapService,
  type MbaDataGap
} from '@/lib/services/mba-data-gap/mba-data-gap-service';
import {
  BOARD_COLUMNS,
  STATUS_LABEL,
  STATUS_BADGE_CLASS
} from '../../_components/board-constants';

/** Statuses that mean an idea is no longer live in the pipeline. */
const TERMINAL_STATUSES: ReadonlySet<ImprovementIdeaStatus> = new Set([
  'closed',
  'rejected',
  'withdrawn',
  'not_pursued'
]);

/** Statuses that count as a delivered win. */
const DELIVERED_STATUSES: ReadonlySet<ImprovementIdeaStatus> = new Set([
  'applied',
  'verified'
]);

function medal(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `#${rank}`;
}

interface AssociateDashboardProps {
  currentUserId: string;
  currentUserName: string;
}

export function AssociateDashboard({
  currentUserId,
  currentUserName
}: AssociateDashboardProps) {
  const { can, isLoading: permsLoading, isSuperAdmin } = usePermissions();
  // can() returns false while permissions load, so canView is only true once
  // the grant is actually confirmed. Branch on permsLoading FIRST below so a
  // still-loading state never reads as "denied" (CLAUDE.md — loading≠denied).
  const canView = isSuperAdmin || can('improvement.ideas.view');

  const [ideas, setIdeas] = useState<ImprovementIdeaEnriched[] | null>(null);
  const [board, setBoard] = useState<ImprovementLeaderboardEntry[] | null>(null);
  const [gaps, setGaps] = useState<MbaDataGap[] | null>(null);

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    Promise.all([
      ImprovementService.listIdeas(),
      ImprovementService.leaderboard(),
      // Filing recognition is a nice-to-have — never let a gap-RPC hiccup block
      // the ideas/board dashboard, so this branch degrades to an empty list.
      MbaDataGapService.listDataGaps().catch(() => [] as MbaDataGap[])
    ]).then(([i, b, g]) => {
      if (cancelled) return;
      setIdeas(i);
      setBoard(b);
      setGaps(g);
    });
    return () => {
      cancelled = true;
    };
  }, [canView]);

  // --- My contribution ------------------------------------------------------
  const myIdeas = useMemo(
    () => (ideas || []).filter((i) => i.author_id === currentUserId),
    [ideas, currentUserId]
  );

  const myByStatus = useMemo(() => {
    const map = new Map<ImprovementIdeaStatus, number>();
    for (const i of myIdeas) map.set(i.status, (map.get(i.status) || 0) + 1);
    return map;
  }, [myIdeas]);

  const myBoardEntry = useMemo(
    () => (board || []).find((r) => r.author_id === currentUserId) || null,
    [board, currentUserId]
  );

  // --- My data-gap contributions (filing recognition) -----------------------
  // Own gaps only — the list RPC returns ALL rows for a manager, so filter by
  // filed_by to stay correct for an associate who also manages the board.
  const myGaps = useMemo(
    () => (gaps || []).filter((g) => g.filed_by === currentUserId),
    [gaps, currentUserId]
  );
  const gapsFiled = myGaps.length;
  const gapsBecameIdeas = useMemo(
    () => myGaps.filter((g) => g.status === 'accepted').length,
    [myGaps]
  );

  // --- Board pulse (aggregate, RLS-scoped) ----------------------------------
  const pulseByStatus = useMemo(() => {
    const map = new Map<ImprovementIdeaStatus, number>();
    for (const i of ideas || []) map.set(i.status, (map.get(i.status) || 0) + 1);
    return map;
  }, [ideas]);

  const pulseTotals = useMemo(() => {
    const all = ideas || [];
    const open = all.filter((i) => !TERMINAL_STATUSES.has(i.status)).length;
    const delivered = all.filter((i) => DELIVERED_STATUSES.has(i.status)).length;
    return { total: all.length, open, delivered };
  }, [ideas]);

  const pulseByArea = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of ideas || []) {
      if (TERMINAL_STATUSES.has(i.status)) continue; // open ideas only
      const label = i.area_label || 'Unassigned area';
      map.set(label, (map.get(label) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [ideas]);

  // --- Gate -----------------------------------------------------------------
  if (permsLoading) return <DashboardSkeleton />;

  if (!canView) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <ShieldAlert className="h-10 w-10 text-amber-500" />
            <div>
              <p className="font-medium">This dashboard is for MBA Associates</p>
              <p className="text-muted-foreground mt-1 text-sm">
                You don&apos;t have access to the Improvement Board dashboard. If
                you believe this is a mistake, contact your programme lead.
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const dataLoading = ideas === null || board === null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <LayoutGrid className="text-primary h-6 w-6" />
            Associate Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Your improvement ideas at a glance, {currentUserName.split(' ')[0]}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/improvement-board/leaderboard">
              <Trophy className="mr-2 h-4 w-4" />
              Impact Leaderboard
            </Link>
          </Button>
          <Button asChild>
            <Link href="/improvement-board">
              <Plus className="mr-2 h-4 w-4" />
              File an idea
            </Link>
          </Button>
        </div>
      </div>

      {dataLoading ? (
        <DashboardSkeleton headerless />
      ) : (
        <>
          {/* ── Your contribution ─────────────────────────────────────── */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <Lightbulb className="text-primary h-4 w-4" />
              Your contribution
            </h2>

            {myIdeas.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                  <Lightbulb className="text-muted-foreground/50 h-10 w-10" />
                  <div>
                    <p className="font-medium">You haven&apos;t filed an idea yet</p>
                    <p className="text-muted-foreground text-sm">
                      Turn an everyday problem into a business case the
                      institution can act on. Your first idea shows up here.
                    </p>
                  </div>
                  <Button asChild>
                    <Link href="/improvement-board">
                      <Plus className="mr-2 h-4 w-4" />
                      File your first idea
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <StatTile
                    label="Ideas filed"
                    value={myIdeas.length}
                    icon={<Lightbulb className="h-4 w-4" />}
                  />
                  <StatTile
                    label="Your score"
                    value={`${myBoardEntry?.total_score ?? 0} pts`}
                    icon={<Activity className="h-4 w-4" />}
                    accent
                  />
                  <StatTile
                    label="Your rank"
                    value={myBoardEntry ? medal(myBoardEntry.rank) : '—'}
                    hint={
                      myBoardEntry
                        ? 'across all contributors'
                        : 'ranked once an idea is scored'
                    }
                    icon={<Trophy className="h-4 w-4" />}
                  />
                </div>

                <Card>
                  <CardContent className="p-4">
                    <p className="text-muted-foreground mb-3 text-xs font-medium uppercase tracking-wide">
                      Your ideas by stage
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {BOARD_COLUMNS.map((col) => {
                        const count = myByStatus.get(col.status) || 0;
                        return (
                          <span
                            key={col.status}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
                              count > 0
                                ? STATUS_BADGE_CLASS[col.status]
                                : 'border-dashed text-muted-foreground'
                            }`}
                          >
                            {STATUS_LABEL[col.status]}
                            <span className="font-semibold">{count}</span>
                          </span>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {/* Filing recognition — a little credit for spotting a gap, and a
                nudge toward the bigger reward when it becomes a fix. Honest by
                design: no impact points until a gap is accepted into an idea. */}
            {gapsFiled > 0 && (
              <Card className="border-violet-200 bg-violet-50/60">
                <CardContent className="flex items-start gap-3 p-4">
                  <FileWarning className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" />
                  <div className="text-sm">
                    <p className="font-medium">
                      You&apos;ve flagged {gapsFiled} data{' '}
                      {gapsFiled === 1 ? 'gap' : 'gaps'}
                    </p>
                    <p className="text-muted-foreground mt-0.5">
                      {gapsBecameIdeas > 0
                        ? `${gapsBecameIdeas} became ${
                            gapsBecameIdeas === 1 ? 'an idea' : 'ideas'
                          } on the board with your name on it — those earn impact as they move forward.`
                        : 'Spotting missing data is a real contribution. When a manager accepts one, it becomes an improvement idea with your name on it.'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </section>

          {/* ── Board pulse ───────────────────────────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <Activity className="text-primary h-4 w-4" />
                Board pulse
              </h2>
              <Link
                href="/improvement-board"
                className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
              >
                Open board
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {pulseTotals.total === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                  <Activity className="text-muted-foreground/50 h-9 w-9" />
                  <p className="font-medium">The board is quiet right now</p>
                  <p className="text-muted-foreground text-sm">
                    No ideas are on the board yet. Be the first to file one and
                    set the pace.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <StatTile
                    label="Ideas you can see"
                    value={pulseTotals.total}
                    icon={<LayoutGrid className="h-4 w-4" />}
                  />
                  <StatTile
                    label="Open (in the pipeline)"
                    value={pulseTotals.open}
                    icon={<Activity className="h-4 w-4" />}
                  />
                  <StatTile
                    label="Applied or verified"
                    value={pulseTotals.delivered}
                    icon={<BadgeCheck className="h-4 w-4" />}
                    accent
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {/* By stage */}
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-muted-foreground mb-3 text-xs font-medium uppercase tracking-wide">
                        Across the programme, by stage
                      </p>
                      <div className="space-y-2">
                        {BOARD_COLUMNS.map((col) => {
                          const count = pulseByStatus.get(col.status) || 0;
                          const Icon = col.icon;
                          return (
                            <div
                              key={col.status}
                              className="flex items-center justify-between text-sm"
                            >
                              <span className="flex items-center gap-2">
                                <Icon className={`h-4 w-4 ${col.color}`} />
                                {col.title}
                              </span>
                              <Badge variant="secondary" className="text-xs">
                                {count}
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  {/* By area */}
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-muted-foreground mb-3 text-xs font-medium uppercase tracking-wide">
                        Open ideas by area
                      </p>
                      {pulseByArea.length === 0 ? (
                        <p className="text-muted-foreground py-6 text-center text-sm">
                          No open ideas right now.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {pulseByArea.map((a) => (
                            <div
                              key={a.label}
                              className="flex items-center justify-between text-sm"
                            >
                              <span className="truncate pr-2">{a.label}</span>
                              <Badge variant="outline" className="text-xs">
                                {a.count}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

// ── Small building blocks ───────────────────────────────────────────────────

function StatTile({
  label,
  value,
  hint,
  icon,
  accent
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <Card className={accent ? 'border-primary/30 bg-primary/5' : undefined}>
      <CardContent className="p-4">
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
          {icon}
          {label}
        </div>
        <p
          className={`mt-2 text-2xl font-bold ${
            accent ? 'text-emerald-700' : ''
          }`}
        >
          {value}
        </p>
        {hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton({ headerless }: { headerless?: boolean }) {
  return (
    <div className="space-y-6">
      {!headerless && <Skeleton className="h-9 w-64" />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-32 w-full" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}
