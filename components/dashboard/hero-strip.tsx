/**
 * Dashboard v2 — Hero Strip (4 KPI tiles)
 *
 * Server component. Consumes DashboardMetrics returned by getDashboardMetrics().
 * Each tile is clickable for drill-down (Day 3+).
 *
 * Spec: specs/myjkkn-dashboard-v2-spec.md §7.1
 */

import Link from 'next/link';
import {
  DashboardMetrics,
  OhsBand,
  formatInr,
  scoreBand,
  formatAttendanceDelta
} from '@/lib/services/dashboard/dashboard-metrics-service';

type TileColor = OhsBand | 'neutral';

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

// ============================================================================
// Tile primitive
// ============================================================================
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
      className={`group relative rounded-2xl border ${TILE_COLOR_CLASS[color]} p-5 backdrop-blur-sm transition-all ${href ? 'hover:shadow-xl hover:-translate-y-0.5 cursor-pointer' : ''}`}
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
// Tile builders per metric
// ============================================================================
function ohsTile(metrics: DashboardMetrics, drillBase: string): HeroTileProps {
  const { score, band, components } = metrics.ohs;
  return {
    label: 'Operational Health',
    value: score,
    subtitle: 'OHS composite — Attendance · SLA · Fees · Escalations',
    hint: undefined,
    color: band,
    href: drillBase,
    footer: (
      <div className='grid grid-cols-4 gap-1 text-center'>
        {(['attendance', 'sla', 'fees', 'escalations'] as const).map((k) => (
          <div key={k}>
            <div className='text-[9px] uppercase opacity-60'>
              {k === 'escalations' ? 'escal' : k}
            </div>
            <div className='text-xs font-semibold tabular-nums'>
              {components[k]}
            </div>
          </div>
        ))}
      </div>
    )
  };
}

function pipelineTile(
  metrics: DashboardMetrics,
  drillBase: string
): HeroTileProps {
  const { value_inr, lead_count } = metrics.pipeline;
  return {
    label: 'Pipeline Value',
    value: formatInr(value_inr),
    subtitle: 'Σ(active leads × conversion probability × avg course fee)',
    hint: `${lead_count.toLocaleString('en-IN')} hot leads open`,
    color: value_inr > 0 ? 'neutral' : 'red',
    href: drillBase
  };
}

function attendanceTile(
  metrics: DashboardMetrics,
  drillBase: string
): HeroTileProps {
  const { pct_today, pct_baseline, present, total } = metrics.attendance;
  const { primary, delta, direction } = formatAttendanceDelta(
    pct_today,
    pct_baseline
  );
  // Color: green if >= baseline - 2, red if < baseline - 10, amber otherwise
  let color: TileColor = 'neutral';
  if (pct_today !== null && pct_baseline !== null) {
    const diff = pct_today - pct_baseline;
    if (diff >= -2) color = 'green';
    else if (diff >= -10) color = 'amber';
    else color = 'red';
  } else if (pct_today !== null) {
    color = scoreBand(pct_today);
  }
  return {
    label: 'Live Attendance',
    value: primary,
    subtitle: `${present.toLocaleString('en-IN')} present of ${total.toLocaleString('en-IN')} expected today`,
    hint: delta ?? undefined,
    color,
    href: drillBase,
    footer: (
      <div className='flex items-center justify-between text-[10px] opacity-70'>
        <span>Baseline: {pct_baseline?.toFixed(1) ?? '—'}%</span>
        <span>
          {direction === 'up' && '↗'}
          {direction === 'down' && '↘'}
          {direction === 'flat' && '→'}
        </span>
      </div>
    )
  };
}

function pendingDecisionsTile(
  metrics: DashboardMetrics,
  queueHash: string
): HeroTileProps {
  const { count } = metrics.pending_decisions;
  const color: TileColor =
    count === 0 ? 'green' : count < 5 ? 'amber' : 'red';
  return {
    label: 'Pending Decisions',
    value: count,
    subtitle:
      count === 0
        ? 'Inbox zero — nothing awaiting your action right now'
        : `${count} item${count === 1 ? '' : 's'} awaiting approve / reject / delegate`,
    hint: undefined,
    color,
    href: queueHash
  };
}

// ============================================================================
// Public component
// ============================================================================
type HeroStripProps = {
  metrics: DashboardMetrics;
  /** URL base for tile drill-downs (e.g. "/dashboard" or "/dashboard/i/abc") */
  drillBase?: string;
  /** In-page anchor for the Pending Decisions tile */
  queueAnchor?: string;
};

export function HeroStrip({
  metrics,
  drillBase = '/dashboard',
  queueAnchor = '#decision-queue'
}: HeroStripProps) {
  const tiles: HeroTileProps[] = [
    ohsTile(metrics, `${drillBase}?drill=ohs`),
    pipelineTile(metrics, `${drillBase}?drill=pipeline`),
    attendanceTile(metrics, `${drillBase}?drill=attendance`),
    pendingDecisionsTile(metrics, queueAnchor)
  ];

  return (
    <section aria-label='Dashboard hero KPIs'>
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4'>
        {tiles.map((tile) => (
          <HeroTile key={tile.label} {...tile} />
        ))}
      </div>
    </section>
  );
}
