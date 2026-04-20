/**
 * Dashboard v2 — Faculty Hero Strip (5 KPI tiles)
 *
 * Server component. Consumes FacultyMetrics from getFacultyMetrics().
 * Tiles: (1) Classes to Mark (2) Teaching Excellence (3) Upcoming Classes
 *        (4) Week Attendance % (5) Cluster Standing (PRIVATE — percentile only, no peers)
 *
 * Spec: specs/myjkkn-dashboard-v2-spec.md §5 + §8
 */

import type {
  FacultyMetrics,
  FacultyBand,
  TeachingExcellenceScore
} from '@/lib/services/dashboard/faculty-metrics-service';
import type {
  ClusterRankPrivate,
  Quartile
} from '@/lib/services/dashboard/cluster-rank-service';

type TileColor = FacultyBand | 'neutral';

// Styling kept parallel to hero-strip.tsx / counselor-hero-strip.tsx
// (helpers duplicated by design — per agent scope, other strip files must remain untouched).
const TILE_COLOR_CLASS: Record<TileColor, string> = {
  green:
    'border-emerald-400/40 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-950 dark:text-emerald-100',
  amber:
    'border-amber-400/40 bg-amber-50/60 dark:bg-amber-950/30 text-amber-950 dark:text-amber-100',
  red: 'border-rose-400/40 bg-rose-50/60 dark:bg-rose-950/30 text-rose-950 dark:text-rose-100',
  neutral:
    'border-neutral-200 bg-white/90 dark:bg-neutral-900/80 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100'
};

const BAND_DOT: Record<TileColor, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-rose-500',
  neutral: 'bg-neutral-400'
};

type HeroTileProps = {
  label: string;
  value: React.ReactNode;
  subtitle: string;
  hint?: string;
  color: TileColor;
  footer?: React.ReactNode;
};

function HeroTile({
  label,
  value,
  subtitle,
  hint,
  color,
  footer
}: HeroTileProps) {
  return (
    <div
      className={`group relative rounded-2xl border ${TILE_COLOR_CLASS[color]} p-5 backdrop-blur-sm transition-all duration-200`}
    >
      <div className='flex items-center justify-between'>
        <span className='text-xs font-medium uppercase tracking-wider opacity-75'>
          {label}
        </span>
        <span
          className={`h-2 w-2 rounded-full ${BAND_DOT[color]}`}
          aria-hidden
        />
      </div>
      <div className='mt-3 text-4xl font-bold tabular-nums leading-none'>
        {value}
      </div>
      <div className='mt-2 text-xs opacity-70 line-clamp-2'>{subtitle}</div>
      {hint && <div className='mt-1 text-[11px] opacity-60'>{hint}</div>}
      {footer && (
        <div className='mt-4 pt-3 border-t border-current/10 text-[11px] opacity-80'>
          {footer}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Tile builders per faculty metric
// ============================================================================
function unmarkedTile(metrics: FacultyMetrics): HeroTileProps {
  const { count, total_today } = metrics.unmarked_classes;
  const allDone = total_today > 0 && count === 0;
  const color: TileColor = allDone ? 'green' : count > 0 ? 'red' : 'neutral';
  return {
    label: 'Classes to Mark',
    value: total_today > 0 ? `${count} / ${total_today}` : '0',
    subtitle: allDone
      ? 'All classes marked for today'
      : count > 0
        ? `${count} class${count === 1 ? '' : 'es'} still need attendance`
        : 'No classes scheduled today',
    hint:
      total_today === 0
        ? 'Check timetable for schedule updates'
        : undefined,
    color
  };
}

/**
 * Doctrines v1 — Teaching Excellence Score tile.
 * Replaces the dead `flagsTile` placeholder (which always showed 'not_available').
 * Components renormalize when NPS/research data is missing.
 */
function teachingExcellenceTile(metrics: FacultyMetrics): HeroTileProps {
  const tes: TeachingExcellenceScore | undefined = metrics.teaching_excellence_score;
  if (!tes || tes.data_source === 'empty' || tes.data_source === 'no_staff_record') {
    return {
      label: 'Teaching Excellence',
      value: '--',
      subtitle: 'Your TES will appear as you teach and mark attendance',
      color: 'neutral'
    };
  }

  const { score, band, components, missing_components } = tes;
  const labelMap: Record<string, string> = {
    student_attendance: 'StuAtt',
    marking_compliance: 'Mark',
    feedback_nps: 'NPS',
    research_mentorship: 'R&M'
  };

  const parts = (['student_attendance', 'marking_compliance', 'feedback_nps', 'research_mentorship'] as const)
    .filter((k) => components[k] !== null && components[k] !== undefined)
    .map((k) => `${labelMap[k]} ${components[k]}`);

  const footerLabel = parts.length > 0 ? parts.join(' · ') : 'No component data yet';
  const missingNote =
    missing_components && missing_components.length > 0
      ? `Pending modules: ${missing_components.map((m) => labelMap[m] || m).join(', ')}`
      : undefined;

  const subtitle =
    band === 'green'
      ? 'Strong teaching trajectory'
      : band === 'amber'
        ? 'On track — a component needs attention'
        : 'Attention needed on multiple components';

  return {
    label: 'Teaching Excellence',
    value: score,
    subtitle,
    hint: missingNote,
    color: band,
    footer: <div className='line-clamp-2'>{footerLabel}</div>
  };
}

function upcomingTile(metrics: FacultyMetrics): HeroTileProps {
  const { classes, next_2h_count } = metrics.upcoming_timetable;
  return {
    label: 'Upcoming Classes',
    value: next_2h_count,
    subtitle:
      next_2h_count === 0
        ? 'No classes in the next 2 hours'
        : `${next_2h_count} class${next_2h_count === 1 ? '' : 'es'} in next 2h`,
    color: 'neutral',
    footer:
      classes.length > 0 ? (
        <div className='space-y-1'>
          {classes.slice(0, 3).map((cls, i) => (
            <div key={i} className='flex items-center justify-between gap-2'>
              <span className='font-medium truncate'>{cls.course}</span>
              <span className='whitespace-nowrap tabular-nums'>{cls.time}</span>
            </div>
          ))}
          {classes.length > 3 && (
            <div className='text-[10px] opacity-60'>
              +{classes.length - 3} more
            </div>
          )}
        </div>
      ) : undefined
  };
}

function weekAttendanceTile(metrics: FacultyMetrics): HeroTileProps {
  const { pct, days_marked, days_total } = metrics.week_attendance;
  let color: TileColor = 'neutral';
  if (days_total > 0) {
    if (pct >= 80) color = 'green';
    else if (pct >= 60) color = 'amber';
    else color = 'red';
  }
  return {
    label: 'Week Attendance %',
    value: days_total > 0 ? `${pct}%` : '--',
    subtitle:
      days_total === 0
        ? 'Week attendance tracking starts Monday'
        : `Marked ${days_marked} of ${days_total} day${days_total === 1 ? '' : 's'} this week`,
    hint:
      days_total > 0 && pct < 80
        ? 'Mark remaining classes to improve'
        : undefined,
    color,
    footer:
      days_total > 0 ? (
        <div className='h-1.5 w-full rounded-full bg-current/10 overflow-hidden'>
          <div
            className='h-full bg-current/60 transition-all'
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      ) : undefined
  };
}

// ============================================================================
// Ordinal helper
// ============================================================================
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ============================================================================
// Cluster rank tile builder (Task 8 — PRIVACY CRITICAL)
// Consumes ONLY: percentile, quartile_label, data_source, forbidden.
// NEVER references peer_scores, leaderboard, or other_faculty fields.
// ============================================================================
function clusterPercentileTile(cluster: ClusterRankPrivate): HeroTileProps {
  if (cluster.forbidden || cluster.percentile === null) {
    const dataSourceMessage = (src: string): string => {
      if (src === 'insufficient_peers') return 'Not enough peer data yet';
      if (src === 'no_staff_record') return 'No staff record found';
      if (src === 'not_in_cluster') return 'Not part of cluster leaderboard';
      if (src === 'pending_cache') return 'Ranking after next weekly refresh';
      return 'Cluster standing unavailable';
    };
    return {
      label: 'Cluster Standing',
      value: '--',
      subtitle: dataSourceMessage(cluster.data_source),
      color: 'neutral'
    };
  }

  const { percentile, quartile_label } = cluster;

  const quartileHuman: Record<Quartile, string> = {
    top_quartile: 'Top Quartile',
    upper_middle: 'Upper Middle',
    lower_middle: 'Lower Middle',
    bottom_quartile: 'Bottom Quartile'
  };

  const color: TileColor =
    percentile >= 75 ? 'green' : percentile >= 50 ? 'amber' : 'red';

  return {
    label: 'Cluster Standing',
    value: ordinal(percentile),
    subtitle: quartile_label ? quartileHuman[quartile_label] : 'Percentile rank',
    hint: 'Among all faculty cluster-wide',
    color
    // No footer — deliberately omitted to prevent any peer breakdown rendering
  };
}

// ============================================================================
// Public component
// ============================================================================
type FacultyHeroStripProps = {
  metrics: FacultyMetrics;
  cluster: ClusterRankPrivate;
};

export function FacultyHeroStrip({ metrics, cluster }: FacultyHeroStripProps) {
  // Doctrines v1: tile 2 swapped from placeholder flagsTile → composite TES.
  // tile 5: Cluster Standing (Task 8) — PRIVATE percentile only, no peer data.
  const tiles: HeroTileProps[] = [
    unmarkedTile(metrics),
    teachingExcellenceTile(metrics),
    upcomingTile(metrics),
    weekAttendanceTile(metrics),
    clusterPercentileTile(cluster)
  ];

  return (
    <section aria-label='Faculty dashboard hero KPIs'>
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4'>
        {tiles.map((tile) => (
          <HeroTile key={tile.label} {...tile} />
        ))}
      </div>
    </section>
  );
}
