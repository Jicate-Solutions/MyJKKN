'use client';

import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, CalendarOff, CheckCircle2, ClipboardCheck, Clock, UserMinus, UserX, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { GroupRow } from '@/lib/campus-living/attendance-cube';
import { formatInt, formatPct, pctTone, RATE_PIVOT, toneClass, useVizPalette } from './palette';

/**
 * Overall counts for the current period AND filter: one hero (the rate, on the same
 * 75% line the heatmap and at-risk count use) and a compact grid of counts. A tile
 * never relies on colour alone — each carries an icon and a label.
 */
export function OverallCards({ total, isLoading }: { total: GroupRow | null; isLoading: boolean }) {
  const viz = useVizPalette();

  if (isLoading || !total) {
    return (
      <div className="grid gap-3 xl:grid-cols-[minmax(260px,320px)_1fr]">
        <Skeleton className="h-[148px]" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-[68px]" />
          ))}
        </div>
      </div>
    );
  }

  const tiles: Array<{ label: string; value: string; sub: string; icon: LucideIcon; accent?: string }> = [
    {
      label: 'Residents',
      value: formatInt(total.residents),
      sub: total.residents === null ? 'allocations not visible' : 'allocated now',
      icon: Users,
    },
    {
      label: 'Marked',
      value: formatInt(total.marked),
      sub: `${formatInt(total.marks)} marks in period`,
      icon: ClipboardCheck,
    },
    {
      label: 'Never marked',
      value: formatInt(total.notMarked),
      sub: 'no roll call recorded',
      icon: UserMinus,
    },
    { label: 'Present', value: formatInt(total.present), sub: 'on time', icon: CheckCircle2, accent: viz.status.present },
    { label: 'Late entry', value: formatInt(total.late), sub: 'counted present', icon: Clock, accent: viz.status.late },
    { label: 'Absent', value: formatInt(total.absent), sub: 'recorded absent', icon: UserX, accent: viz.status.absent },
    {
      label: 'On leave',
      value: formatInt(total.onLeave + total.medical),
      sub: total.medical ? `${formatInt(total.medical)} medical · not in rate` : 'not in rate',
      icon: CalendarOff,
      accent: viz.status.leave,
    },
    {
      label: 'At risk',
      value: formatInt(total.atRisk),
      sub: `of ${formatInt(total.learners)} learners under ${RATE_PIVOT}%`,
      icon: AlertTriangle,
    },
  ];

  const pct = total.pct;

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(260px,320px)_1fr]">
      <Card>
        <CardContent className="flex h-full flex-col justify-between gap-3 p-4 sm:p-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Attendance rate</p>
            <p className={`mt-1 text-4xl font-bold tabular-nums sm:text-5xl ${toneClass(pctTone(pct))}`}>
              {formatPct(pct)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatInt(total.attended)} present of {formatInt(total.denom)} counted marks
            </p>
          </div>
          {/* Bullet bar: the fill is the rate, the tick is the 75% at-risk line. */}
          <div>
            <div
              className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={`Attendance rate ${formatPct(pct)}; at-risk line ${RATE_PIVOT}%`}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${pct ?? 0}%`, backgroundColor: viz.rateFill(pct) }}
              />
              <div
                className="absolute inset-y-0 w-0.5 bg-foreground/70"
                style={{ left: `${RATE_PIVOT}%` }}
                aria-hidden
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>0%</span>
              <span>{RATE_PIVOT}% line</span>
              <span>100%</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="overflow-hidden">
            <CardContent className="relative p-3 sm:p-4">
              {t.accent && (
                <span
                  className="absolute inset-y-0 left-0 w-1"
                  style={{ backgroundColor: t.accent }}
                  aria-hidden
                />
              )}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <t.icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t.label}</span>
              </div>
              <p className="mt-1 text-2xl font-semibold tabular-nums leading-none">{t.value}</p>
              <p className="mt-1.5 line-clamp-2 text-[11px] leading-tight text-muted-foreground">{t.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
