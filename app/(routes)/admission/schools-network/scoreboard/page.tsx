'use client';

/**
 * Leadership Scoreboard — Schools Network feeder momentum.
 *
 * A director/admin board that answers one question at a glance: are we GAINING
 * or LOSING learners from our feeder schools this admission cycle vs last? The
 * headline is the org-wide net change; below it, the biggest per-school gainers
 * and losers so leadership knows where to look.
 *
 * Numbers reconcile with the feeder discovery panel — same canonical name key,
 * same merge (alias) resolution, same cycle detection (see
 * fn_schools_network_scoreboard). Read-only; gated schools_network.schools.view.
 */

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Info,
  Minus,
  Network,
  School,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { getScoreboard, type ScoreboardMover } from '../_lib/scoreboard-api';
import { NoAccess } from '../_lib/no-access';

const SCOREBOARD_KEY = ['schools-network', 'scoreboard'] as const;

function n(v: number | null | undefined): string {
  return (v ?? 0).toLocaleString();
}

/** Signed delta badge — green up / red down / neutral flat. */
function DeltaBadge({ delta }: { delta: number }) {
  if (delta > 0) {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200">
        <ArrowUpRight className="h-3 w-3 mr-0.5" />+{n(delta)}
      </Badge>
    );
  }
  if (delta < 0) {
    return (
      <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200">
        <ArrowDownRight className="h-3 w-3 mr-0.5" />
        {n(delta)}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">
      <Minus className="h-3 w-3 mr-0.5" />0
    </Badge>
  );
}

/** A small supporting stat tile. */
function StatTile({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

/** One top-movers table (gainers or losers). */
function MoversCard({
  title,
  description,
  icon: Icon,
  iconClass,
  rows,
  cycleYear,
  priorYear,
  emptyText,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  iconClass: string;
  rows: ScoreboardMover[];
  cycleYear: number | null;
  priorYear: number | null;
  emptyText: string;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className={`h-5 w-5 ${iconClass}`} /> {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        {rows.length === 0 ? (
          <div className="text-center py-10">
            <School className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">{emptyText}</p>
          </div>
        ) : (
          <div className="divide-y">
            {/* header row */}
            <div className="flex items-center justify-between pb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
              <span>School</span>
              <span className="flex items-center gap-6">
                <span className="w-24 text-right">
                  {priorYear ?? '—'} → {cycleYear ?? '—'}
                </span>
                <span className="w-16 text-right">Change</span>
              </span>
            </div>
            {rows.map((r, idx) => (
              <div
                // index-suffixed: two distinct canonical keys can share a display
                // name, which would otherwise collide as duplicate React keys.
                key={`${r.school_name}-${idx}`}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <span
                  className="min-w-0 truncate text-sm font-medium"
                  title={r.school_name}
                >
                  {r.school_name}
                </span>
                <span className="flex items-center gap-6 shrink-0">
                  <span className="w-24 text-right text-sm tabular-nums text-muted-foreground">
                    {n(r.prior)} → {n(r.current)}
                  </span>
                  <span className="w-16 flex justify-end">
                    <DeltaBadge delta={r.delta} />
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ScoreboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-40 w-full" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
  );
}

function ScoreboardContent() {
  const { data, isLoading, error } = useQuery({
    queryKey: SCOREBOARD_KEY,
    queryFn: () => getScoreboard(),
    retry: false, // a server 403 shouldn't retry
  });

  if (isLoading) return <ScoreboardSkeleton />;

  // Even though PermissionGuard gates client-side, the RPC is the real
  // authority — surface a server 403 explicitly rather than a blank error.
  const status = (error as { status?: number } | null)?.status;
  if (status === 403) {
    return (
      <div className="text-center py-16">
        <ShieldAlert className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium mb-1">Administrators &amp; view-holders only</h3>
        <p className="text-sm text-muted-foreground">
          The scoreboard reads network-wide admission data, so it&apos;s limited
          to Schools Network viewers.
        </p>
      </div>
    );
  }
  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-1">Couldn&apos;t load the scoreboard</h3>
          <p className="text-sm text-muted-foreground">
            {(error as Error).message || 'Something went wrong. Please try again.'}
          </p>
        </CardContent>
      </Card>
    );
  }
  if (!data || typeof data.feeder_count !== 'number' || data.feeder_count === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <School className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-medium mb-1">No feeder data yet</h3>
          <p className="text-sm text-muted-foreground">
            Once learners record their previous school at admission, this board
            will track how each feeder is trending.
          </p>
        </CardContent>
      </Card>
    );
  }

  const delta = data.total_delta ?? 0;
  // `!= null` so an undefined prior_cycle_year (defensive) is treated as "no
  // baseline", not a real one.
  const hasBaseline = data.prior_cycle_year != null;
  // A signed delta + trend arrow only means something against a prior cycle.
  // Without a baseline the headline shows the absolute current count neutrally.
  const up = hasBaseline && delta > 0;
  const down = hasBaseline && delta < 0;

  const HeadlineIcon = !hasBaseline
    ? School
    : up
      ? TrendingUp
      : down
        ? TrendingDown
        : Minus;
  const headlineColor = !hasBaseline
    ? 'text-foreground'
    : up
      ? 'text-emerald-600'
      : down
        ? 'text-red-600'
        : 'text-muted-foreground';
  const headlineWord = up ? 'gaining' : down ? 'losing' : 'holding steady on';

  return (
    <div className="space-y-6">
      {/* ── Momentum headline ─────────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Feeder momentum · {data.cycle_year ?? '—'} cycle
              </div>
              <div className={`mt-1 flex items-baseline gap-2 ${headlineColor}`}>
                <HeadlineIcon className="h-8 w-8 shrink-0 self-center" />
                <span className="text-5xl font-bold tabular-nums">
                  {hasBaseline ? (
                    <>
                      {delta > 0 ? '+' : ''}
                      {n(delta)}
                    </>
                  ) : (
                    n(data.total_current)
                  )}
                </span>
                <span className="text-lg font-medium text-muted-foreground">
                  learners
                </span>
              </div>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                {hasBaseline ? (
                  <>
                    We&apos;re{' '}
                    <span className="font-medium text-foreground">
                      {headlineWord}
                    </span>{' '}
                    learners from feeder schools this cycle vs{' '}
                    {data.prior_cycle_year} — <span className="italic">so far</span>{' '}
                    (the {data.cycle_year} cycle is still filling).
                  </>
                ) : (
                  <>
                    {n(data.total_current)} learners enrolled from feeder schools
                    this cycle. There&apos;s no earlier cohort on record yet, so a
                    trend will appear once a second cycle is captured.
                  </>
                )}
              </p>
            </div>

            {/* current vs prior side numbers */}
            {hasBaseline && (
              <div className="flex items-center gap-6 rounded-lg border bg-muted/30 px-5 py-4">
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">
                    {data.prior_cycle_year}
                  </div>
                  <div className="text-2xl font-semibold tabular-nums">
                    {n(data.total_prior)}
                  </div>
                </div>
                <div className="text-muted-foreground">→</div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">
                    {data.cycle_year}
                  </div>
                  <div className="text-2xl font-semibold tabular-nums">
                    {n(data.total_current)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Supporting stats ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile
          label="Feeder schools"
          value={n(data.feeder_count)}
          icon={School}
          hint="Distinct schools sending learners or leads"
        />
        <StatTile
          label="Adopted into network"
          value={n(data.adopted_count)}
          icon={Network}
          hint={`${
            data.feeder_count > 0
              ? Math.round((data.adopted_count / data.feeder_count) * 100)
              : 0
          }% of feeders formally adopted`}
        />
        <StatTile
          label="Enrolled this cycle"
          value={n(data.total_current)}
          icon={TrendingUp}
          hint={`${data.cycle_year ?? '—'} admissions from feeders (so far)`}
        />
      </div>

      {/* ── Top movers ────────────────────────────────────────────────── */}
      {hasBaseline ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MoversCard
            title="Biggest gainers"
            description="Feeders sending the most extra learners this cycle"
            icon={TrendingUp}
            iconClass="text-emerald-600"
            rows={data.gainers ?? []}
            cycleYear={data.cycle_year}
            priorYear={data.prior_cycle_year}
            emptyText="No feeder gained learners this cycle."
          />
          <MoversCard
            title="Biggest losers"
            description="Feeders sending the fewest learners vs last cycle"
            icon={TrendingDown}
            iconClass="text-red-600"
            rows={data.losers ?? []}
            cycleYear={data.cycle_year}
            priorYear={data.prior_cycle_year}
            emptyText="No feeder dropped learners this cycle."
          />
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <Info className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">
              Per-school movers need two admission cycles to compare. They&apos;ll
              appear here once a prior cohort is on record.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function ScoreboardPage() {
  return (
    <PermissionGuard
      module="schools_network.schools"
      action="view"
      fallback={<NoAccess what="the feeder scoreboard" />}
    >
      <ContentLayout title="Leadership Scoreboard">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/admission/schools-network">
                Schools Network
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Scoreboard</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="mt-6">
          <ScoreboardContent />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
