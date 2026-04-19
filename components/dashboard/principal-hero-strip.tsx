/**
 * Dashboard v2 — Principal Hero Strip (4 KPI tiles)
 *
 * Server component. Consumes PrincipalMetrics from getPrincipalMetrics().
 * Tiles:
 *   1) Institution Health Score (OHS)
 *   2) Staff Attendance Today
 *   3) Today's Incidents
 *   4) Pending Approvals
 *
 * Spec: specs/myjkkn-dashboard-v2-spec.md §5 + §8
 */

import type {
  PrincipalMetrics,
  PrincipalBand
} from '@/lib/services/dashboard/principal-metrics-service';

type TileColor = PrincipalBand | 'neutral';

// Styling kept parallel to hero-strip.tsx / faculty-hero-strip.tsx
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
// Tile builders per principal metric
// ============================================================================
function healthScoreTile(metrics: PrincipalMetrics): HeroTileProps {
  const { score, band, components } = metrics.health_score;
  const color: TileColor = band as TileColor;
  const parts = [
    components.attendance != null && `Att ${components.attendance}`,
    components.sla != null && `SLA ${components.sla}`,
    components.fees != null && `Fees ${components.fees}`,
    components.escalations != null && `Esc ${components.escalations}`
  ].filter(Boolean);

  return {
    label: 'Institution Health',
    value: score,
    subtitle:
      score === 0
        ? 'Health score calculating...'
        : `Overall health is ${band}`,
    color,
    footer: parts.length > 0 ? (
      <div className='flex flex-wrap gap-x-3 gap-y-1'>
        {parts.map((p, i) => (
          <span key={i}>{p}</span>
        ))}
      </div>
    ) : undefined
  };
}

function staffAttendanceTile(metrics: PrincipalMetrics): HeroTileProps {
  const { present, total, pct, data_source } = metrics.staff_attendance;
  const notAvailable = data_source === 'not_available';
  let color: TileColor = 'neutral';
  if (!notAvailable && total > 0) {
    if (pct >= 90) color = 'green';
    else if (pct >= 75) color = 'amber';
    else color = 'red';
  }
  return {
    label: 'Staff Attendance',
    value: notAvailable ? '--' : `${pct}%`,
    subtitle: notAvailable
      ? 'Staff attendance tracking launching soon'
      : `${present} of ${total} staff present today`,
    hint: notAvailable ? 'Will track biometric/HR attendance' : undefined,
    color,
    footer: !notAvailable && total > 0 ? (
      <div className='h-1.5 w-full rounded-full bg-current/10 overflow-hidden'>
        <div
          className='h-full bg-current/60 transition-all'
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    ) : undefined
  };
}

function incidentsTile(metrics: PrincipalMetrics): HeroTileProps {
  const { today_count, open_count } = metrics.incidents;
  let color: TileColor = 'green';
  if (today_count > 2 || open_count > 5) color = 'red';
  else if (today_count > 0 || open_count > 2) color = 'amber';

  return {
    label: "Today's Incidents",
    value: today_count,
    subtitle:
      today_count === 0
        ? 'No incidents reported today'
        : `${today_count} incident${today_count === 1 ? '' : 's'} reported today`,
    hint:
      open_count > 0
        ? `${open_count} total unresolved incident${open_count === 1 ? '' : 's'}`
        : undefined,
    color
  };
}

function pendingApprovalsTile(metrics: PrincipalMetrics): HeroTileProps {
  const { count } = metrics.pending_approvals;
  let color: TileColor = 'green';
  if (count > 5) color = 'red';
  else if (count > 0) color = 'amber';

  return {
    label: 'Pending Approvals',
    value: count,
    subtitle:
      count === 0
        ? 'All caught up — nothing awaiting your action'
        : `${count} item${count === 1 ? '' : 's'} awaiting your decision`,
    hint:
      count > 5
        ? 'Consider clearing older items first'
        : undefined,
    color
  };
}

// ============================================================================
// Public component
// ============================================================================
type PrincipalHeroStripProps = {
  metrics: PrincipalMetrics;
};

export function PrincipalHeroStrip({ metrics }: PrincipalHeroStripProps) {
  const tiles: HeroTileProps[] = [
    healthScoreTile(metrics),
    staffAttendanceTile(metrics),
    incidentsTile(metrics),
    pendingApprovalsTile(metrics)
  ];

  return (
    <section aria-label='Principal dashboard hero KPIs'>
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4'>
        {tiles.map((tile) => (
          <HeroTile key={tile.label} {...tile} />
        ))}
      </div>
    </section>
  );
}
