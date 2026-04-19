/**
 * Dashboard v2 Week-2 — Counselor Hero Strip (4 KPI tiles)
 *
 * Server component. Consumes CounselorMetrics from getCounselorMetrics().
 * Tiles: (1) Your SLA today (2) Conversion Velocity (3) Hot leads to call (4) Calls / target
 *
 * Note: data will populate as admission_leads.assigned_counselor_id gets backfilled
 * (currently 0% populated on staging/prod — tiles render zero-state gracefully).
 *
 * Spec: specs/myjkkn-dashboard-v2-spec.md §5 + §8
 * Doctrines v1: tile 2 swapped from Daily Rank → CVS composite
 * (Routines-Stickiness-Ivy-Doctrine.md). rank signal preserved inside CVS.
 */

import Link from 'next/link';
import {
  CounselorMetrics,
  CounselorBand,
  ConversionVelocityScore
} from '@/lib/services/dashboard/counselor-metrics-service';

type TileColor = CounselorBand | 'neutral';

// Styling kept parallel to hero-strip.tsx (helpers duplicated by design —
// per agent scope, hero-strip.tsx must remain untouched).
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
  href?: string;
  footer?: React.ReactNode;
};

function HeroTile({
  label,
  value,
  subtitle,
  hint,
  color,
  href,
  footer
}: HeroTileProps) {
  const Wrapper: React.ElementType = href ? Link : 'div';
  const wrapperProps = href ? { href } : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={`group relative rounded-2xl border ${TILE_COLOR_CLASS[color]} p-5 backdrop-blur-sm transition-all duration-200 ${href ? 'hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-500' : ''}`}
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
    </Wrapper>
  );
}

// ============================================================================
// Tile builders per counselor metric
// ============================================================================
function slaTile(metrics: CounselorMetrics): HeroTileProps {
  const { median_minutes_today, compliance_pct, band } = metrics.sla;
  const value =
    median_minutes_today === null ? '—' : `${median_minutes_today}m`;
  return {
    label: 'Your SLA Today',
    value,
    subtitle:
      median_minutes_today === null
        ? 'No responses logged yet today'
        : 'Median first-touch response time (today)',
    hint: `${compliance_pct}% compliant within 4h window`,
    color: band,
    href: '/admissions/leads?filter=mine'
  };
}

/**
 * Doctrines v1 — Conversion Velocity Score tile.
 * Replaces the `rankTile` (Your Daily Rank) at position 2.
 * The raw daily-rank signal is preserved inside CVS as one of 4 components
 * (inverted: 1st = 100), so no operational info is lost. Components
 * renormalize if conversion or calls data is still populating.
 */
function conversionVelocityTile(metrics: CounselorMetrics): HeroTileProps {
  const cvs: ConversionVelocityScore | undefined =
    metrics.conversion_velocity_score;
  if (!cvs || cvs.data_source === 'empty' || cvs.data_source === 'no_staff_record') {
    return {
      label: 'Conversion Velocity',
      value: '--',
      subtitle: 'Your CVS will appear as you respond, call and convert leads',
      color: 'neutral'
    };
  }

  const { score, band, components, missing_components } = cvs;
  const labelMap: Record<string, string> = {
    sla_compliance: 'SLA',
    daily_rank: 'Rank',
    calls_vs_target: 'Calls',
    conversion: 'Conv'
  };

  const parts = (
    ['sla_compliance', 'daily_rank', 'calls_vs_target', 'conversion'] as const
  )
    .filter((k) => components[k] !== null && components[k] !== undefined)
    .map((k) => `${labelMap[k]} ${components[k]}`);

  const footerLabel =
    parts.length > 0 ? parts.join(' · ') : 'No component data yet';
  const missingNote =
    missing_components && missing_components.length > 0
      ? `Pending: ${missing_components.map((m) => labelMap[m] || m).join(', ')}`
      : undefined;

  const subtitle =
    band === 'green'
      ? 'Strong conversion trajectory'
      : band === 'amber'
        ? 'On track — a component needs attention'
        : 'Attention needed on multiple components';

  return {
    label: 'Conversion Velocity',
    value: score,
    subtitle,
    hint: missingNote,
    color: band,
    footer: <div className='line-clamp-2'>{footerLabel}</div>
  };
}

function hotLeadsTile(metrics: CounselorMetrics): HeroTileProps {
  const { to_call_count, cold_count } = metrics.hot_leads;
  let color: TileColor = 'neutral';
  if (cold_count >= 3) color = 'red';
  else if (cold_count >= 1 || to_call_count >= 5) color = 'amber';
  else if (to_call_count === 0) color = 'green';
  return {
    label: 'Hot Leads to Call',
    value: to_call_count,
    subtitle:
      to_call_count === 0
        ? 'No hot leads awaiting your first touch'
        : 'Score \u2265 70, no first touch yet',
    hint:
      cold_count > 0
        ? `${cold_count} cold (\u2265 4h old) — risk of rescue broadcast`
        : undefined,
    color,
    href: '/admissions/leads?filter=mine&score=hot&untouched=1'
  };
}

function callsTile(metrics: CounselorMetrics): HeroTileProps {
  const { made_today, daily_target, pct } = metrics.calls;
  let color: TileColor = 'neutral';
  if (pct >= 100) color = 'green';
  else if (pct >= 60) color = 'amber';
  else color = 'red';
  return {
    label: 'Calls / Target',
    value: `${made_today} / ${daily_target}`,
    subtitle: 'Call activities logged today',
    hint: `${pct}% of daily target`,
    color,
    footer: (
      <div className='h-1.5 w-full rounded-full bg-current/10 overflow-hidden'>
        <div
          className='h-full bg-current/60 transition-all'
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    )
  };
}

// ============================================================================
// Public component
// ============================================================================
type CounselorHeroStripProps = {
  metrics: CounselorMetrics;
};

export function CounselorHeroStrip({ metrics }: CounselorHeroStripProps) {
  // Doctrines v1: tile 2 swapped from rankTile → composite CVS.
  // The rankTile signal is preserved inside CVS as the inverted daily_rank
  // component (20% weight), so the leaderboard axis lives on as part of the
  // composite rather than as a standalone tile.
  const tiles: HeroTileProps[] = [
    slaTile(metrics),
    conversionVelocityTile(metrics),
    hotLeadsTile(metrics),
    callsTile(metrics)
  ];

  return (
    <section aria-label='Counselor dashboard hero KPIs'>
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4'>
        {tiles.map((tile) => (
          <HeroTile key={tile.label} {...tile} />
        ))}
      </div>
    </section>
  );
}
