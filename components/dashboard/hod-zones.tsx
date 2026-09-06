'use client';

/**
 * HOD dashboard — job-shaped zones (redesign, 2026-07-23).
 *
 * Replaces the two stacked hero strips an HOD-who-teaches used to see
 * (HodHeroStrip + "Your teaching" + FacultyHeroStrip) with ONE component
 * organised by the viewer's JOB rather than by data source:
 *
 *   Zone 1 — NEEDS YOU (act)      : only not-ok items render as action cards;
 *                                    everything that is fine folds into one
 *                                    green "All clear" line.
 *   Zone 2 — HOW YOU'RE DOING     : the scored metrics, merged into ONE panel
 *                                    with a Department / Your teaching split.
 *                                    AI Agency appears EXACTLY ONCE here (the old
 *                                    two strips each rendered it, so an HOD saw it
 *                                    up to four times — fixed at the source).
 *
 * Zone 3 (My Pulse / WorkSignalsCard) is rendered SEPARATELY by page.tsx and is
 * deliberately NOT part of this component — its whole value is "no scores, no
 * comparisons", so it must never read as one of the scored rows.
 *
 * Data: the HOD side (dept metrics + both cluster leaderboards) is fetched
 * client-side, exactly as HodHeroStrip did; the teaching side (FacultyMetrics +
 * private percentile) is fetched on the server and passed in as props.
 *
 * Supersedes PR #2276 — the age-aware Grievance/Leave/Marking colours are folded
 * in here (see the cutoff constants below).
 */

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  Users,
  ClipboardCheck,
  NotebookPen,
  AlertTriangle,
  CalendarClock,
  Trophy,
  Medal,
  GraduationCap,
  CalendarDays,
  TrendingUp,
  CheckCircle2,
  ArrowRight,
  type LucideIcon
} from 'lucide-react';
import {
  HodMetrics,
  HodMetricsService
} from '@/lib/services/dashboard/hod-metrics-service';
import type { FacultyMetrics } from '@/lib/services/dashboard/faculty-metrics-service';
import type {
  ClusterRankPublic,
  ClusterRankHodsPublic,
  ClusterRankPrivate,
  Quartile
} from '@/lib/services/dashboard/cluster-rank-service';
import { AgencyRecognitionTile } from './agency-recognition-tile';

// ── Semantic status → tile colour. Reused verbatim from hod-hero-strip.tsx /
//    faculty-hero-strip.tsx so the redesign is a re-layout, not a re-skin. Colour
//    follows the metric's STATE, never decoration:
//      green = good / encourage · amber = heads-up · red = act-now
//      neutral = no data yet, or a purely informational tile (not pass/fail).
//    Colour is never the only signal — each tile also carries a status dot and a
//    status subtitle (accessible for red/green colour-vision). ──
const STATUS_TILE = {
  green:
    'border-emerald-400/40 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-950 dark:text-emerald-100',
  amber:
    'border-amber-400/40 bg-amber-50/60 dark:bg-amber-950/30 text-amber-950 dark:text-amber-100',
  red: 'border-rose-400/40 bg-rose-50/60 dark:bg-rose-950/30 text-rose-950 dark:text-rose-100',
  neutral:
    'border-neutral-200 bg-white/90 dark:bg-neutral-900/80 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100'
} as const;
const BAND_DOT = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-rose-500',
  neutral: 'bg-neutral-400'
} as const;
type Status = keyof typeof STATUS_TILE;

// ── Age-aware status cutoffs (folded from PR #2276). All tunable HERE without a
//    DB change — fn_hod_metrics only reports the raw counts + "oldest open" ages;
//    the thresholds that turn those into a colour live in the component. ──
const MARKING_GREEN_MIN = 80; // marking compliance ≥ this → green
const MARKING_AMBER_MIN = 40; // 40–79% → amber
const MARKING_RED_HOUR_IST = 16; // below 40%: heads-up in the morning, act-now from 4 pm IST
const GRIEVANCE_OVERDUE_DAYS = 7; // an open grievance older than this → red
const LEAVE_PILE_COUNT = 5; // this many pending approvals → red
const LEAVE_OVERDUE_DAYS = 3; // oldest pending approval older than this → red

// Current hour in IST (Asia/Kolkata, UTC+5:30, no DST) — the marking colour flips
// to red only in the afternoon, so it must be IST regardless of viewer timezone.
function currentIstHour(): number {
  const raw = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    hour12: false
  })
    .formatToParts(new Date())
    .find((p) => p.type === 'hour')?.value;
  const n = parseInt(raw ?? '0', 10);
  return Number.isFinite(n) ? n % 24 : 0;
}

// ── Age-aware status resolvers ──
function markingStatus(pct: number, istHour: number): Status {
  if (pct >= MARKING_GREEN_MIN) return 'green';
  if (pct >= MARKING_AMBER_MIN) return 'amber';
  return istHour >= MARKING_RED_HOUR_IST ? 'red' : 'amber';
}
function grievanceStatus(count: number, oldestDays: number): Status {
  if (count === 0) return 'green';
  return oldestDays > GRIEVANCE_OVERDUE_DAYS ? 'red' : 'amber';
}
function leaveStatus(count: number, oldestDays: number): Status {
  if (count === 0) return 'green';
  return count >= LEAVE_PILE_COUNT || oldestDays > LEAVE_OVERDUE_DAYS
    ? 'red'
    : 'amber';
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ── Small presentational pieces ──
function ZoneHeader({
  num,
  title,
  desc
}: {
  num: number;
  title: string;
  desc: string;
}) {
  return (
    <div className='mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 px-0.5'>
      <span className='grid h-5 w-5 place-items-center rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 text-[11px] font-bold text-neutral-500'>
        {num}
      </span>
      <span className='text-xs font-bold uppercase tracking-[0.14em] text-neutral-400 dark:text-neutral-500'>
        {title}
      </span>
      <span className='text-[13px] text-neutral-500 dark:text-neutral-400'>
        {desc}
      </span>
    </div>
  );
}

function GroupHeader({ children }: { children: ReactNode }) {
  return (
    <div className='px-1 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500'>
      {children}
    </div>
  );
}

function TileSkeleton() {
  return (
    <div className='rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm p-5 animate-pulse'>
      <div className='h-3 w-1/3 bg-neutral-200 dark:bg-neutral-800 rounded' />
      <div className='mt-4 h-8 w-1/2 bg-neutral-200 dark:bg-neutral-800 rounded' />
      <div className='mt-3 h-2 w-3/4 bg-neutral-100 dark:bg-neutral-900 rounded' />
    </div>
  );
}

function ZonesSkeleton() {
  return (
    <div className='space-y-6'>
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4'>
        {[0, 1, 2].map((i) => (
          <TileSkeleton key={i} />
        ))}
      </div>
      <div className='rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 p-4'>
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <TileSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Zone 1 — action card + all-clear line ──
type ZoneItem = {
  key: string;
  icon: LucideIcon;
  label: string;
  scope: 'You' | 'Dept';
  value: string;
  status: Status;
  cardSub: string; // why it needs you (shown on the card)
  clearedText: string; // compact entry for the "All clear" line
  href?: string;
  linkText?: string;
};

function ActionCard({ item }: { item: ZoneItem }) {
  const Icon = item.icon;
  return (
    <div
      className={`rounded-2xl border p-5 backdrop-blur-sm transition-all duration-200 ${STATUS_TILE[item.status]}`}
    >
      <div className='flex items-center justify-between gap-2'>
        <span className='flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider opacity-75'>
          <span
            className={`h-2 w-2 rounded-full ${BAND_DOT[item.status]}`}
            aria-hidden
          />
          <Icon className='h-3.5 w-3.5' aria-hidden />
          {item.label}
        </span>
        <span className='text-[10px] font-semibold uppercase tracking-wide rounded-md border border-current/15 bg-current/5 px-1.5 py-0.5 opacity-70'>
          {item.scope}
        </span>
      </div>
      <div className='mt-3 text-3xl font-semibold tabular-nums leading-none'>
        {item.value}
      </div>
      <div className='mt-1.5 text-xs opacity-70'>{item.cardSub}</div>
      {item.href && item.linkText && (
        <Link
          href={item.href}
          className='mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:gap-1.5 transition-all'
        >
          {item.linkText}
          <ArrowRight className='h-3.5 w-3.5' aria-hidden />
        </Link>
      )}
    </div>
  );
}

function ClearedStrip({ items }: { items: ZoneItem[] }) {
  // "nothing overdue" is only claimed when BOTH age-tracked items (grievances +
  // leave) are in the clear — never while one of them is showing as a card above.
  const grievanceClear = items.some((i) => i.key === 'grievances');
  const leaveClear = items.some((i) => i.key === 'leave');
  const overdueLine = grievanceClear && leaveClear ? ' · nothing overdue' : '';
  return (
    <div className='mt-4 flex items-start gap-3 rounded-2xl border border-emerald-400/40 bg-emerald-50/60 dark:bg-emerald-950/30 px-4 py-3'>
      <CheckCircle2
        className='mt-0.5 h-5 w-5 flex-none text-emerald-600 dark:text-emerald-400'
        aria-hidden
      />
      <p className='text-sm text-emerald-950 dark:text-emerald-100'>
        <span className='font-semibold text-emerald-700 dark:text-emerald-300'>
          All clear
        </span>
        {' — '}
        {items.map((i) => i.clearedText).join(' · ')}
        {overdueLine}.
      </p>
    </div>
  );
}

// ── Zone 2 — one scored tile ──
function MeasureTile({
  icon: Icon,
  label,
  value,
  subtitle,
  status
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  subtitle: string;
  status: Status;
}) {
  return (
    <div className={`rounded-xl border p-4 ${STATUS_TILE[status]}`}>
      <div className='flex items-center justify-between gap-2'>
        <span className='flex items-center gap-1.5 text-[11px] uppercase tracking-wider opacity-70'>
          <Icon className='h-3.5 w-3.5' aria-hidden />
          {label}
        </span>
        <span
          className={`h-2 w-2 rounded-full ${BAND_DOT[status]}`}
          aria-hidden
        />
      </div>
      <div className='mt-2.5 text-2xl font-semibold tabular-nums leading-none'>
        {value}
      </div>
      <div className='mt-1 text-xs opacity-70 line-clamp-2'>{subtitle}</div>
    </div>
  );
}

// ============================================================================
// Public component
// ============================================================================
type HodZonesProps = {
  facultyMetrics: FacultyMetrics;
  facultyCluster: ClusterRankPrivate;
};

export function HodZones({ facultyMetrics, facultyCluster }: HodZonesProps) {
  // HOD side is fetched client-side (same three sources HodHeroStrip used).
  const [hod, setHod] = useState<HodMetrics | null>(null);
  const [cluster, setCluster] = useState<ClusterRankPublic | null>(null);
  const [hodCluster, setHodCluster] = useState<ClusterRankHodsPublic | null>(
    null
  );
  const [istHour, setIstHour] = useState<number>(() => currentIstHour());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIstHour(currentIstHour());
    Promise.all([
      HodMetricsService.getMetrics(),
      fetch('/api/dashboard/cluster-rank')
        .then((r) => r.json())
        .catch(() => null),
      fetch('/api/dashboard/cluster-rank/hods')
        .then((r) => r.json())
        .catch(() => null)
    ])
      .then(([m, c, h]) => {
        if (cancelled) return;
        setHod(m);
        setCluster(c as ClusterRankPublic | null);
        setHodCluster(h as ClusterRankHodsPublic | null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Rethrown during render → DashboardErrorBoundary surfaces it visibly,
        // matching HodHeroStrip (never a silent forever-loading state).
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) throw error;
  if (loading || !hod) return <ZonesSkeleton />;

  // ── Zone 1 candidates ──
  const gOldest = hod.grievance_oldest_days ?? 0;
  const lOldest = hod.leave_oldest_days ?? 0;
  const marking = hod.marking_compliance_pct;
  const markStatus = markingStatus(marking, istHour);

  const items: ZoneItem[] = [];

  // Sessions to mark (the viewer's own timetable) — "You"
  const { count: unmarkedCount, total_today: totalToday } =
    facultyMetrics.unmarked_classes;
  items.push({
    key: 'unmarked',
    icon: NotebookPen,
    label: 'Sessions to mark',
    scope: 'You',
    value: totalToday > 0 ? `${unmarkedCount} / ${totalToday}` : '0',
    status:
      totalToday > 0 && unmarkedCount === 0
        ? 'green'
        : unmarkedCount > 0
          ? 'red'
          : 'neutral',
    cardSub: `${unmarkedCount} session${unmarkedCount === 1 ? '' : 's'} still need attendance today.`,
    clearedText:
      totalToday > 0 ? 'All your sessions marked' : 'No sessions to mark today',
    href: '/academic/attendance',
    linkText: 'Mark attendance'
  });

  // Marking compliance across the department — "Dept" (time-aware)
  items.push({
    key: 'marking',
    icon: ClipboardCheck,
    label: 'Marking compliance',
    scope: 'Dept',
    value: `${marking}%`,
    status: markStatus,
    cardSub:
      marking < MARKING_AMBER_MIN
        ? istHour >= MARKING_RED_HOUR_IST
          ? 'Still low this afternoon — sessions across the department need marking.'
          : 'Low so far — normal this early. Turns red if still low after 4 pm.'
        : 'Some sessions across the department are still unmarked.',
    clearedText: `Marking ${marking}%`,
    href: '/academic/attendance/pending',
    linkText: 'Open department marking'
  });

  // Open grievances — "Dept" (age-aware). No canonical HOD review route exists,
  // so this card intentionally carries no deep-link.
  items.push({
    key: 'grievances',
    icon: AlertTriangle,
    label: 'Open grievances',
    scope: 'Dept',
    value: String(hod.open_grievances),
    status: grievanceStatus(hod.open_grievances, gOldest),
    cardSub:
      hod.open_grievances === 0
        ? 'No open grievances.'
        : `Oldest open ${gOldest} day${gOldest === 1 ? '' : 's'}${gOldest > GRIEVANCE_OVERDUE_DAYS ? ' — overdue.' : '.'}`,
    clearedText: `Open grievances ${hod.open_grievances}`
  });

  // Pending leave approvals — "Dept" (age-aware)
  items.push({
    key: 'leave',
    icon: CalendarClock,
    label: 'Leave approvals',
    scope: 'Dept',
    value: String(hod.pending_leave_approvals),
    status: leaveStatus(hod.pending_leave_approvals, lOldest),
    cardSub:
      hod.pending_leave_approvals === 0
        ? 'No pending approvals.'
        : `${hod.pending_leave_approvals} pending · oldest ${lOldest} day${lOldest === 1 ? '' : 's'}.`,
    clearedText: `Pending leave approvals ${hod.pending_leave_approvals}`,
    href: '/hr/leave/approve',
    linkText: 'Review leave approvals'
  });

  const cards = items.filter((i) => i.status === 'amber' || i.status === 'red');
  const cleared = items.filter(
    (i) => i.status === 'green' || i.status === 'neutral'
  );

  // ── Zone 2 — Department tiles ──
  const dhs = hod.department_health_score;
  const dhsStatus: Status =
    !dhs || dhs.score == null || dhs.score <= 0
      ? 'neutral'
      : dhs.band === 'green'
        ? 'green'
        : dhs.band === 'amber'
          ? 'amber'
          : 'red';
  const dhsComponentsLine = dhs?.components
    ? (['dept_attendance', 'faculty_marking', 'grievance_resolution'] as const)
        .filter((k) => dhs.components[k] != null)
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
  const dhsValue: ReactNode = dhs && dhs.score > 0 ? dhs.score : '—';
  const dhsSub =
    dhsStatus === 'neutral'
      ? 'Awaiting attendance & grievance data'
      : dhsComponentsLine || `Att ${hod.dept_attendance_pct}% today`;

  const callerRank = cluster?.caller_rank ?? null;
  const callerScore = cluster?.caller_score ?? null;
  const leaderboardLen = cluster?.leaderboard?.length ?? 0;
  const clusterTied =
    callerRank != null && cluster
      ? cluster.leaderboard.filter((e) => e.rank === callerRank).length > 1
      : false;
  const clusterValue =
    cluster == null || cluster.forbidden || leaderboardLen === 0
      ? '—'
      : callerRank != null
        ? clusterTied
          ? `#${callerRank} (tied)`
          : `#${callerRank} / ${leaderboardLen}`
        : '—';
  const clusterSub =
    cluster == null
      ? 'Loading…'
      : cluster.forbidden || leaderboardLen === 0
        ? 'Cluster unavailable'
        : callerScore != null
          ? `OHS ${callerScore}`
          : 'Cluster leaderboard';
  const clusterStatus: Status =
    cluster == null || cluster.forbidden || callerRank === null
      ? 'neutral'
      : callerRank <= 3
        ? 'green'
        : callerRank <= 5
          ? 'amber'
          : 'red';

  const hodRank = hodCluster?.caller_rank ?? null;
  const hodScore = hodCluster?.caller_score ?? null;
  const hodLen = hodCluster?.leaderboard?.length ?? 0;
  const hodTied =
    hodRank != null && hodCluster
      ? hodCluster.leaderboard.filter((e) => e.rank === hodRank).length > 1
      : false;
  const hodRankValue =
    hodCluster == null || hodCluster.forbidden || hodLen === 0
      ? '—'
      : hodRank != null
        ? hodTied
          ? `#${hodRank} (tied)`
          : `#${hodRank} / ${hodLen}`
        : '—';
  const hodRankSub =
    hodCluster == null
      ? 'Loading…'
      : hodCluster.forbidden || hodLen === 0
        ? 'Leaderboard pending'
        : hodScore != null
          ? `DHS ${hodScore}`
          : 'HOD leaderboard';
  const hodRankStatus: Status =
    hodCluster == null || hodCluster.forbidden || hodRank === null
      ? 'neutral'
      : hodRank <= 3
        ? 'green'
        : hodRank <= 10
          ? 'amber'
          : 'red';

  // ── Zone 2 — Your teaching tiles ──
  const tes = facultyMetrics.teaching_excellence_score;
  const tesPresent =
    !!tes &&
    tes.data_source !== 'empty' &&
    tes.data_source !== 'no_staff_record';
  const tesPresentCount = tes
    ? (
        [
          'student_attendance',
          'marking_compliance',
          'feedback_nps',
          'research_mentorship'
        ] as const
      ).filter((k) => tes.components[k] != null).length
    : 0;
  const tesWarming = !tesPresent || tesPresentCount <= 1;
  const tesStatus: Status = tesWarming ? 'neutral' : (tes!.band as Status);
  const tesValue: ReactNode = tesWarming ? '—' : tes!.score;
  const tesSub = !tesPresent
    ? 'Your teaching excellence score appears as you teach and mark attendance'
    : tesWarming
      ? 'Getting started — grows as you mark sessions'
      : tes!.band === 'green'
        ? 'Strong teaching trajectory'
        : tes!.band === 'amber'
          ? 'On track — a component needs attention'
          : 'Attention needed on multiple components';

  const wk = facultyMetrics.week_attendance;
  const wkStatus: Status =
    wk.days_total === 0
      ? 'neutral'
      : wk.pct >= 80
        ? 'green'
        : wk.pct >= 60
          ? 'amber'
          : 'red';
  const wkValue: ReactNode = wk.days_total > 0 ? `${wk.pct}%` : '—';
  const wkSub =
    wk.days_total === 0
      ? 'Week attendance tracking starts Monday'
      : `Marked ${wk.days_marked} of ${wk.days_total} day${wk.days_total === 1 ? '' : 's'} this week`;

  const standingStatus: Status =
    facultyCluster.forbidden || facultyCluster.percentile == null
      ? 'neutral'
      : facultyCluster.percentile >= 75
        ? 'green'
        : facultyCluster.percentile >= 50
          ? 'amber'
          : 'red';
  const standingValue: ReactNode =
    facultyCluster.forbidden || facultyCluster.percentile == null
      ? '—'
      : ordinal(facultyCluster.percentile);
  const quartileHuman: Record<Quartile, string> = {
    top_quartile: 'Top quartile',
    upper_middle: 'Upper middle',
    lower_middle: 'Lower middle',
    bottom_quartile: 'Bottom quartile'
  };
  const standingSub =
    facultyCluster.forbidden || facultyCluster.percentile == null
      ? facultyCluster.data_source === 'insufficient_peers'
        ? 'Not enough peer data yet'
        : facultyCluster.data_source === 'pending_cache'
          ? 'Ranking after next weekly refresh'
          : 'Cluster standing unavailable'
      : facultyCluster.quartile_label
        ? quartileHuman[facultyCluster.quartile_label]
        : 'Percentile rank';

  return (
    <div className='space-y-6'>
      {/* ── ZONE 1 — NEEDS YOU ── */}
      <section>
        <ZoneHeader
          num={1}
          title='Needs you'
          desc="What won't happen unless you act. Everything that's fine is folded away."
        />
        {cards.length > 0 && (
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4'>
            {cards.map((c) => (
              <ActionCard key={c.key} item={c} />
            ))}
          </div>
        )}
        {cleared.length > 0 && <ClearedStrip items={cleared} />}
      </section>

      {/* ── ZONE 2 — HOW YOU'RE DOING ── */}
      <section>
        <ZoneHeader
          num={2}
          title="How you & your dept are doing"
          desc='Scores that judge against a target or rank — one panel, no longer split in two.'
        />
        <div className='rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/70 dark:bg-neutral-900/60 backdrop-blur-sm p-3 sm:p-4'>
          <GroupHeader>Department</GroupHeader>
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3'>
            <MeasureTile
              icon={Users}
              label='Dept health'
              value={dhsValue}
              subtitle={dhsSub}
              status={dhsStatus}
            />
            <MeasureTile
              icon={Trophy}
              label='Cluster rank'
              value={clusterValue}
              subtitle={clusterSub}
              status={clusterStatus}
            />
            <MeasureTile
              icon={Medal}
              label='HOD rank'
              value={hodRankValue}
              subtitle={hodRankSub}
              status={hodRankStatus}
            />
          </div>

          <div className='my-3 h-px bg-neutral-200 dark:bg-neutral-800' />

          <GroupHeader>Your teaching</GroupHeader>
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3'>
            <MeasureTile
              icon={GraduationCap}
              label='Teaching excellence'
              value={tesValue}
              subtitle={tesSub}
              status={tesStatus}
            />
            <MeasureTile
              icon={CalendarDays}
              label='Week attendance'
              value={wkValue}
              subtitle={wkSub}
              status={wkStatus}
            />
            <MeasureTile
              icon={TrendingUp}
              label='Cluster standing'
              value={standingValue}
              subtitle={standingSub}
              status={standingStatus}
            />
          </div>

          {/* AI Agency — rendered EXACTLY ONCE for the HOD. The old hod- and
              faculty- hero strips each rendered this tile, so an HOD-who-teaches
              saw it up to four times; deduping at the source is the fix. */}
          <div className='mt-3'>
            <AgencyRecognitionTile />
          </div>
        </div>
      </section>
    </div>
  );
}
