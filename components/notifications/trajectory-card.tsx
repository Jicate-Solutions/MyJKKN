// components/notifications/trajectory-card.tsx
'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { CategoryTrajectory } from '@/lib/services/notification/notification-trajectories-service';

/**
 * One trajectory card per category. Replaces 5+ duplicate "Daily digest"
 * cards with a single dense row showing today's value, a 7-14 day sparkline,
 * change-vs-baseline, sub-category breakdown, and a click-through CTA.
 *
 * Visual direction: Editorial × Bloomberg.
 * - Cream paper background, ink-black text (vs the platform default white/gray)
 * - Tabular monospace numerals for trajectory readability
 * - 4px severity ribbon on the left edge (Manchester triage palette)
 * - Inline SVG sparkline, no library dependency
 * - Letter-spaced small caps for category label
 */

interface TrajectoryCardProps {
  trajectory: CategoryTrajectory;
  onMarkRead?: (userNotificationId: string) => void;
}

const SEVERITY: Record<string, { ink: string; ribbon: string; tint: string; chipBg: string }> = {
  'dashboard:rescue': {
    ink: '#7a0a0a',
    ribbon: '#b40000',
    tint: '#fef4f0',
    chipBg: '#fde4dc'
  },
  'dashboard:approval': {
    ink: '#7a4a0a',
    ribbon: '#c47e1a',
    tint: '#fdf6e8',
    chipBg: '#f7e6c0'
  },
  'dashboard:anomaly': {
    ink: '#7a4a0a',
    ribbon: '#c47e1a',
    tint: '#fdf6e8',
    chipBg: '#f7e6c0'
  },
  'dashboard:hr_brief': {
    ink: '#1f5f3f',
    ribbon: '#1f5f3f',
    tint: '#f0f7f3',
    chipBg: '#d8ebe0'
  }
};

const DEFAULT_SEVERITY = {
  ink: '#0d0d0d',
  ribbon: '#6b6b6b',
  tint: '#f5f4f0',
  chipBg: '#e8e6df'
};

function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('en-IN');
}

function formatChange(pct: number | null): string {
  if (pct === null) return '';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(0)}% / 7d`;
}

interface SparklineProps {
  values: Array<number | null>;
  color: string;
  width?: number;
  height?: number;
}

function Sparkline({ values, color, width = 200, height = 36 }: SparklineProps) {
  const valid = values.map((v, i) => ({ v: v ?? 0, i, isNull: v === null }));
  if (valid.length < 2) {
    return (
      <svg width={width} height={height} aria-hidden role="presentation">
        <line
          x1="0"
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke={color}
          strokeWidth="1"
          strokeDasharray="2,3"
          opacity="0.4"
        />
      </svg>
    );
  }

  const numericValues = valid.map((p) => p.v);
  const min = Math.min(...numericValues);
  const max = Math.max(...numericValues);
  const range = max - min || 1;
  const padY = 4;
  const usableH = height - padY * 2;
  const stepX = width / (valid.length - 1);

  const points = valid.map((p, idx) => ({
    x: idx * stepX,
    y: padY + usableH - ((p.v - min) / range) * usableH,
    isNull: p.isNull
  }));

  const path = points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  // Area fill underneath the line for visual weight (Bloomberg trick)
  const areaPath =
    `${path} L ${points[points.length - 1].x.toFixed(1)} ${height} ` +
    `L ${points[0].x.toFixed(1)} ${height} Z`;

  const last = points[points.length - 1];

  return (
    <svg width={width} height={height} aria-hidden role="presentation">
      <path d={areaPath} fill={color} opacity="0.08" />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last.x} cy={last.y} r="2.5" fill={color} />
    </svg>
  );
}

export function TrajectoryCard({ trajectory: t }: TrajectoryCardProps) {
  const sev = SEVERITY[t.category] ?? DEFAULT_SEVERITY;
  const breakdownEntries = Object.entries(t.breakdown).slice(0, 6);
  const sparkValues = t.trajectory.map((p) => p.total);

  return (
    <article
      className="group relative grid gap-3 border-b border-stone-200/80 dark:border-stone-700/60 py-5 first:pt-3 last:border-b-0"
      style={{
        gridTemplateColumns: 'auto 1fr auto'
      }}
    >
      {/* Severity ribbon — bleeds full height on hover */}
      <div
        aria-hidden
        className="w-1 self-stretch rounded-sm transition-all duration-200 group-hover:w-1.5"
        style={{ backgroundColor: sev.ribbon }}
      />

      {/* Center content */}
      <div className="min-w-0 space-y-2">
        {/* Eyebrow: small-caps category label */}
        <div
          className="text-[11px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: sev.ink }}
        >
          {t.label}
        </div>

        {/* Headline: number + sparkline + arrow + change */}
        <div className="flex items-baseline gap-3 flex-wrap">
          <span
            className="text-[2.25rem] leading-none tracking-tight tabular-nums"
            style={{
              color: '#0d0d0d',
              fontFamily: 'var(--font-newsreader), Georgia, "Times New Roman", serif',
              fontVariantNumeric: 'tabular-nums',
              fontWeight: 500,
              letterSpacing: '-0.02em'
            }}
          >
            {formatNumber(t.current_total)}
          </span>
          <span aria-hidden className="opacity-70">
            <Sparkline values={sparkValues} color={sev.ribbon} />
          </span>
          <span
            className="text-sm tabular-nums font-medium"
            style={{ color: sev.ink, fontVariantNumeric: 'tabular-nums' }}
          >
            <span aria-hidden className="mr-1">
              {t.trend_arrow}
            </span>
            {formatChange(t.change_pct_7d)}
          </span>
        </div>

        {/* Breakdown chips */}
        {breakdownEntries.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {breakdownEntries.map(([key, value]) => (
              <span
                key={key}
                className="inline-flex items-baseline gap-1 px-2 py-0.5 text-xs rounded-sm"
                style={{
                  backgroundColor: sev.chipBg,
                  color: sev.ink
                }}
              >
                <span className="capitalize">{key.replace(/_/g, ' ')}</span>
                <span className="font-mono tabular-nums font-semibold">
                  {formatNumber(value)}
                </span>
              </span>
            ))}
          </div>
        )}

        {/* Footer: date strip */}
        <div className="text-[11px] text-stone-500 dark:text-stone-400 tabular-nums pt-0.5">
          {t.trajectory.length} day{t.trajectory.length === 1 ? '' : 's'} · last seen{' '}
          {new Date(t.latest_at).toLocaleDateString('en-IN', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
          })}
        </div>
      </div>

      {/* Right: action CTA */}
      <div className="flex flex-col items-end justify-center gap-1.5 self-center">
        {t.action_url && (
          <Link
            href={t.action_url}
            className={cn(
              'text-xs font-semibold uppercase tracking-wider px-3 py-1.5',
              'border border-current rounded-sm',
              'transition-colors hover:bg-current hover:text-stone-50',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1'
            )}
            style={{ color: sev.ink }}
          >
            Open queue →
          </Link>
        )}
      </div>
    </article>
  );
}
