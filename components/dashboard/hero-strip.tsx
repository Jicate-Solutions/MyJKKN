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
type HeroTileAction = {
  label: string;
  href: string;
};

type HeroTileProps = {
  label: string;
  value: React.ReactNode;
  subtitle: string;
  hint?: string;
  color: TileColor;
  href?: string;
  footer?: React.ReactNode;
  /**
   * Actionability upgrade #1 (2026-04-21): inline call-to-action rendered
   * as a pill at the bottom of the tile. Shown regardless of color, but
   * typically only set when `color` is red/amber so the user has an obvious
   * next move on the problem metrics.
   */
  action?: HeroTileAction;
};

function HeroTile({
  label,
  value,
  subtitle,
  hint,
  color,
  href,
  footer,
  action
}: HeroTileProps) {
  // When we render a nested <Link> for `action`, the outer wrapper can't also
  // be a <Link> — nested anchors are invalid HTML. Fall back to a <div> in
  // that case; the action button becomes the primary click target.
  const useOuterLink = !!href && !action;
  const Wrapper: React.ElementType = useOuterLink ? Link : 'div';
  const wrapperProps = useOuterLink ? { href: href! } : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={`group relative rounded-2xl border ${TILE_COLOR_CLASS[color]} p-5 backdrop-blur-sm transition-all duration-200 ${useOuterLink ? 'hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-500' : ''}`}
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
      {action && (
        <Link
          href={action.href}
          className='mt-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-current/10 hover:bg-current/20 transition-colors'
        >
          {action.label}
          <span aria-hidden='true'>→</span>
        </Link>
      )}
    </Wrapper>
  );
}

// ============================================================================
// Tile builders per metric
// ============================================================================
function ohsTile(metrics: DashboardMetrics, drillBase: string): HeroTileProps {
  const { score, band, components } = metrics.ohs;

  // Actionability #1: when OHS is not green, point the user at the weakest component.
  const weakestKey = (['attendance', 'sla', 'fees', 'escalations'] as const).reduce(
    (lowest, k) => (components[k] < components[lowest] ? k : lowest),
    'attendance' as const
  );
  const weakestHref: Record<typeof weakestKey, string> = {
    attendance: '/academic/attendance/dashboard',
    sla: '/admission/leads?filter=sla_breach',
    fees: '/billing/receipts?status=overdue',
    escalations: '/dashboard?queue=escalation'
  };
  const action: HeroTileAction | undefined =
    band === 'red' || band === 'amber'
      ? {
          label: `Fix weakest: ${weakestKey} (${components[weakestKey]}%)`,
          href: weakestHref[weakestKey]
        }
      : undefined;

  return {
    label: 'Operational Health',
    value: score,
    subtitle: 'OHS composite — Attendance · SLA · Fees · Escalations',
    hint: undefined,
    color: band,
    href: drillBase,
    action,
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
  // Actionability #1: 0 leads is suspicious — either ingestion is broken or
  // counselors need to add leads. Either way, director should know where to go.
  const action: HeroTileAction | undefined =
    lead_count === 0
      ? { label: 'No leads? Check ingestion', href: '/admission/leads' }
      : value_inr === 0
        ? { label: 'Open admission queue', href: '/admission/leads' }
        : undefined;
  return {
    label: 'Pipeline Value',
    value: formatInr(value_inr),
    subtitle: 'Σ(active leads × conversion probability × avg course fee)',
    hint: `${lead_count.toLocaleString('en-IN')} hot leads open`,
    color: value_inr > 0 ? 'neutral' : 'red',
    href: drillBase,
    action
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

  // Actionability #1: when attendance is below baseline, link to attendance dashboard.
  // When no attendance data exists (null), also link — because no data = likely
  // unmarked classes that need the director's nudge.
  const action: HeroTileAction | undefined =
    color === 'red'
      ? { label: 'Open attendance', href: '/academic/attendance/dashboard' }
      : pct_today === null
        ? { label: 'No data — open attendance', href: '/academic/attendance/dashboard' }
        : undefined;

  return {
    label: 'Live Attendance',
    value: primary,
    subtitle: `${present.toLocaleString('en-IN')} present of ${total.toLocaleString('en-IN')} expected today`,
    hint: delta ?? undefined,
    color,
    href: drillBase,
    action,
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
  // Actionability #1: always give the user a single-click path to clear the queue
  // when it's non-zero. Tile is already clickable, but an explicit CTA makes the
  // action obvious and separates "glance" from "act".
  const action: HeroTileAction | undefined =
    count > 0 ? { label: `Clear ${count} item${count === 1 ? '' : 's'}`, href: queueHash } : undefined;
  return {
    label: 'Pending Decisions',
    value: count,
    subtitle:
      count === 0
        ? 'Inbox zero — nothing awaiting your action right now'
        : `${count} item${count === 1 ? '' : 's'} awaiting approve / reject / delegate`,
    hint: undefined,
    color,
    href: queueHash,
    action
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
