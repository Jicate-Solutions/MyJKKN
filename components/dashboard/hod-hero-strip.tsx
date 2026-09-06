'use client';

import { useEffect, useState } from 'react';
import {
  HodMetrics,
  HodMetricsService
} from '@/lib/services/dashboard/hod-metrics-service';
import type {
  ClusterRankPublic,
  ClusterRankHodsPublic
} from '@/lib/services/dashboard/cluster-rank-service';
import { Users, ClipboardCheck, AlertTriangle, CalendarClock, Trophy, Medal } from 'lucide-react';
import { AgencyRecognitionTile } from './agency-recognition-tile';

// ── Semantic status → tile colour (parallel to faculty-hero-strip.tsx; helpers
//    duplicated by design — other strip files stay untouched). Colour follows the
//    metric's STATE, never decoration:
//      green = good / encourage · amber = heads-up · red = act-now
//      neutral = no data yet, or a purely informational tile (not pass/fail).
//    Colour is never the only signal — each tile also carries its icon, a status
//    dot, and a status subtitle (accessible for red/green colour-vision). ──
const STATUS_TILE = {
  green: 'border-emerald-400/40 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-950 dark:text-emerald-100',
  amber: 'border-amber-400/40 bg-amber-50/60 dark:bg-amber-950/30 text-amber-950 dark:text-amber-100',
  red: 'border-rose-400/40 bg-rose-50/60 dark:bg-rose-950/30 text-rose-950 dark:text-rose-100',
  neutral: 'border-neutral-200 bg-white/90 dark:bg-neutral-900/80 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100'
} as const;
const BAND_DOT = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-rose-500',
  neutral: 'bg-neutral-400'
} as const;
type Status = keyof typeof STATUS_TILE;

function TileSkeleton() {
  return (
    <div className='rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm p-5 animate-pulse'>
      <div className='h-3 w-1/3 bg-neutral-200 dark:bg-neutral-800 rounded' />
      <div className='mt-4 h-8 w-1/2 bg-neutral-200 dark:bg-neutral-800 rounded' />
      <div className='mt-3 h-2 w-3/4 bg-neutral-100 dark:bg-neutral-900 rounded' />
    </div>
  );
}

export default function HodHeroStrip() {
  const [metrics, setMetrics] = useState<HodMetrics | null>(null);
  const [cluster, setCluster] = useState<ClusterRankPublic | null>(null);
  const [hodCluster, setHodCluster] = useState<ClusterRankHodsPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      HodMetricsService.getMetrics(),
      fetch('/api/dashboard/cluster-rank').then((r) => r.json()).catch(() => null),
      fetch('/api/dashboard/cluster-rank/hods').then((r) => r.json()).catch(() => null)
    ])
      .then(([m, c, h]) => {
        if (!cancelled) {
          setMetrics(m);
          setCluster(c as ClusterRankPublic | null);
          setHodCluster(h as ClusterRankHodsPublic | null);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          // 2026-04-21: Rethrown during render so DashboardErrorBoundary can catch.
          // Without this, promise rejection silently leaves loading=true forever.
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Rethrow during render to trigger the nearest Error Boundary. Without this,
  // the component would swallow the metrics-service throw into an empty tile.
  if (error) throw error;

  if (loading) {
    return (
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-3 sm:gap-4'>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <TileSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!metrics) return null;

  // Doctrines v1: tile 1 swapped from standalone attendance → composite DHS.
  // Attendance surfaces as the largest DHS component (dept_attendance).
  const dhs = metrics.department_health_score;
  // No data → neutral (previously rendered red/bad); amber band → amber
  // (previously rendered blue via the 'compliance' style).
  const dhsStatus: Status =
    !dhs || dhs.score == null || dhs.score <= 0 ? 'neutral'
    : dhs.band === 'green' ? 'green'
    : dhs.band === 'amber' ? 'amber'
    : 'red';
  // Marking: more sections marked = better. Grievances / leave-approvals: fewer =
  // better, and ZERO is the good (green) state — not a warning. Sensible defaults,
  // easy to tune.
  const markingStatus: Status =
    metrics.marking_compliance_pct >= 80 ? 'green'
    : metrics.marking_compliance_pct >= 40 ? 'amber'
    : 'red';
  const grievanceStatus: Status =
    metrics.open_grievances === 0 ? 'green'
    : metrics.open_grievances <= 2 ? 'amber'
    : 'red';
  const leaveStatus: Status =
    metrics.pending_leave_approvals === 0 ? 'green'
    : metrics.pending_leave_approvals <= 4 ? 'amber'
    : 'red';
  const dhsComponentsLine = dhs?.components
    ? (['dept_attendance', 'faculty_marking', 'grievance_resolution'] as const)
        .filter((k) => dhs.components[k] !== null && dhs.components[k] !== undefined)
        .map((k) => {
          const labels: Record<string, string> = {
            dept_attendance: 'Att',
            faculty_marking: 'Mark',
            grievance_resolution: 'Griev'
          };
          return `${labels[k]} ${dhs.components[k]}`;
        })
        .join(' · ')
    : '';
  const dhsHint = (dhs?.missing_components?.length ?? 0) > 0
    ? `Pending: ${dhs?.missing_components?.join(', ')}`
    : undefined;

  // Cluster rank tile helpers
  const callerRank = cluster?.caller_rank ?? null;
  const callerScore = cluster?.caller_score ?? null;
  const leaderboardLen = cluster?.leaderboard?.length ?? 0;
  const tiedCount =
    callerRank != null && cluster
      ? cluster.leaderboard.filter((e) => e.rank === callerRank).length
      : 0;
  const clusterTied = tiedCount > 1;
  const clusterValue =
    cluster === null
      ? '--'
      : cluster.forbidden || leaderboardLen === 0
        ? '--'
        : callerRank != null
          ? clusterTied
            ? `#${callerRank} (tied)`
            : `#${callerRank} / ${leaderboardLen}`
          : '--';
  const clusterSubtitle =
    cluster === null
      ? 'Loading...'
      : cluster.forbidden || leaderboardLen === 0
        ? 'Cluster unavailable'
        : callerScore != null
          ? `OHS ${callerScore}`
          : 'Cluster leaderboard';
  const clusterStatus: Status =
    cluster === null || cluster.forbidden || callerRank === null ? 'neutral'
    : callerRank <= 3 ? 'green'
    : callerRank <= 5 ? 'amber'
    : 'red';

  // ── Task 7b — HOD DHS cluster rank tile (peers see peers) ──
  const hodRank = hodCluster?.caller_rank ?? null;
  const hodScore = hodCluster?.caller_score ?? null;
  const hodLeaderboardLen = hodCluster?.leaderboard?.length ?? 0;
  const hodTiedCount =
    hodRank != null && hodCluster
      ? hodCluster.leaderboard.filter((e) => e.rank === hodRank).length
      : 0;
  const hodTied = hodTiedCount > 1;
  const hodValue =
    hodCluster === null
      ? '--'
      : hodCluster.forbidden || hodLeaderboardLen === 0
        ? '--'
        : hodRank != null
          ? hodTied
            ? `#${hodRank} (tied)`
            : `#${hodRank} / ${hodLeaderboardLen}`
          : '--';
  const hodSubtitle =
    hodCluster === null
      ? 'Loading...'
      : hodCluster.forbidden || hodLeaderboardLen === 0
        ? 'HOD cluster unavailable'
        : hodScore != null
          ? `DHS ${hodScore}`
          : 'HOD leaderboard';
  const hodStatus: Status =
    hodCluster === null || hodCluster.forbidden || hodRank === null ? 'neutral'
    : hodRank <= 3 ? 'green'
    : hodRank <= 10 ? 'amber'
    : 'red';

  return (
    <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-3 sm:gap-4'>
      {/* Tile 1 — Department Health Score (DHS) */}
      <div
        className={`rounded-2xl border p-5 backdrop-blur-sm transition-all duration-200 ${STATUS_TILE[dhsStatus]}`}
      >
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-2 text-[11px] uppercase tracking-wider opacity-70'>
            <Users className='h-3.5 w-3.5' />
            Dept Health
          </div>
          <span className={`h-2 w-2 rounded-full ${BAND_DOT[dhsStatus]}`} aria-hidden />
        </div>
        <div className='mt-3 text-3xl font-semibold tabular-nums'>
          {dhs && dhs.score > 0 ? dhs.score : '--'}
        </div>
        <div className='mt-1 text-xs opacity-70 line-clamp-1'>
          {dhsComponentsLine || `Att ${metrics.dept_attendance_pct}% (today)`}
        </div>
        {dhsHint && (
          <div className='mt-1 text-[10px] opacity-50'>{dhsHint}</div>
        )}
      </div>

      {/* Tile 2 — Faculty Marking Compliance */}
      <div
        className={`rounded-2xl border p-5 backdrop-blur-sm transition-all duration-200 ${STATUS_TILE[markingStatus]}`}
      >
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-2 text-[11px] uppercase tracking-wider opacity-70'>
            <ClipboardCheck className='h-3.5 w-3.5' />
            Marking Compliance
          </div>
          <span className={`h-2 w-2 rounded-full ${BAND_DOT[markingStatus]}`} aria-hidden />
        </div>
        <div className='mt-3 text-3xl font-semibold tabular-nums'>
          {metrics.marking_compliance_pct}%
        </div>
        <div className='mt-1 text-xs opacity-60'>Sections marked today</div>
      </div>

      {/* Tile 3 — Open Grievances */}
      <div
        className={`rounded-2xl border p-5 backdrop-blur-sm transition-all duration-200 ${STATUS_TILE[grievanceStatus]}`}
      >
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-2 text-[11px] uppercase tracking-wider opacity-70'>
            <AlertTriangle className='h-3.5 w-3.5' />
            Open Grievances
          </div>
          <span className={`h-2 w-2 rounded-full ${BAND_DOT[grievanceStatus]}`} aria-hidden />
        </div>
        <div className='mt-3 text-3xl font-semibold tabular-nums'>
          {metrics.open_grievances}
        </div>
        <div className='mt-1 text-xs opacity-60'>
          {metrics.open_grievances === 0 ? 'All clear' : 'Needs attention'}
        </div>
      </div>

      {/* Tile 4 — Pending Leave Approvals */}
      <div
        className={`rounded-2xl border p-5 backdrop-blur-sm transition-all duration-200 ${STATUS_TILE[leaveStatus]}`}
      >
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-2 text-[11px] uppercase tracking-wider opacity-70'>
            <CalendarClock className='h-3.5 w-3.5' />
            Leave Approvals
          </div>
          <span className={`h-2 w-2 rounded-full ${BAND_DOT[leaveStatus]}`} aria-hidden />
        </div>
        <div className='mt-3 text-3xl font-semibold tabular-nums'>
          {metrics.pending_leave_approvals}
        </div>
        <div className='mt-1 text-xs opacity-60'>
          {metrics.pending_leave_approvals === 0
            ? 'No pending'
            : 'Pending review'}
        </div>
      </div>

      {/* Tile 5 — Cluster Rank */}
      <div
        className={`rounded-2xl border p-5 backdrop-blur-sm transition-all duration-200 ${STATUS_TILE[clusterStatus]}`}
      >
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-2 text-[11px] uppercase tracking-wider opacity-70'>
            <Trophy className='h-3.5 w-3.5' />
            Cluster Rank
          </div>
          <span className={`h-2 w-2 rounded-full ${BAND_DOT[clusterStatus]}`} aria-hidden />
        </div>
        <div className='mt-3 text-3xl font-semibold tabular-nums'>
          {clusterValue}
        </div>
        <div className='mt-1 text-xs opacity-60 line-clamp-1'>
          {clusterSubtitle}
        </div>
        {cluster && !cluster.forbidden && leaderboardLen > 0 && (
          <div className='mt-3 pt-2 border-t border-current/10 text-[10px] opacity-70 space-y-0.5'>
            <div className='uppercase tracking-wider opacity-60 mb-1'>Top 3</div>
            {cluster.leaderboard
              .filter((e) => e.rank <= 3)
              .slice(0, 3)
              .map((e) => (
                <div key={e.institution_id}>
                  {e.counselling_code}: {e.ohs_score}
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Tile 6 — HOD DHS Cluster Rank (Task 7b: peers see peers) */}
      <div
        className={`rounded-2xl border p-5 backdrop-blur-sm transition-all duration-200 ${STATUS_TILE[hodStatus]}`}
      >
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-2 text-[11px] uppercase tracking-wider opacity-70'>
            <Medal className='h-3.5 w-3.5' />
            HOD DHS Rank
          </div>
          <span className={`h-2 w-2 rounded-full ${BAND_DOT[hodStatus]}`} aria-hidden />
        </div>
        <div className='mt-3 text-3xl font-semibold tabular-nums'>
          {hodValue}
        </div>
        <div className='mt-1 text-xs opacity-60 line-clamp-1'>
          {hodSubtitle}
        </div>
        {hodCluster && !hodCluster.forbidden && hodLeaderboardLen > 0 && (
          <div className='mt-3 pt-2 border-t border-current/10 text-[10px] opacity-70 space-y-0.5'>
            <div className='uppercase tracking-wider opacity-60 mb-1'>Top 3 HODs</div>
            {hodCluster.leaderboard
              .filter((e) => e.rank <= 3)
              .slice(0, 3)
              .map((e) => (
                <div key={e.hod_user_id} className='truncate'>
                  {e.hod_name}: {e.dhs_score}
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Tile 7 — Own AI-agency recognition signal (self-only /api/pde/agency). */}
      <AgencyRecognitionTile />
    </div>
  );
}
