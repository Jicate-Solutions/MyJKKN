'use client';

import { TrendingDown, TrendingUp, Minus, Target, Zap } from 'lucide-react';
import {
  computeVerdicts,
  computeProjectionVerdict,
  computeWeekPaceVerdict,
  cycleLabel,
  type Verdict,
  type ProjectionVerdict,
  type WeekPaceVerdict,
} from './_helpers/verdict-math';
import { formatIndianNumber, formatDeltaPct } from './_helpers/chart-formatters';
import type { YoYTrajectoryRow } from '@/lib/services/admission/yoy-trajectory-service';

type Props = {
  trajectory: YoYTrajectoryRow[];
  isLoading: boolean;
  /**
   * Optional — the academic-year (start year, e.g. 2026 = 2026-27 cycle)
   * selected by the Director in the page-level AY dropdown. When this differs
   * from the verdict's anchored cycle (which is always the latest cycle with
   * meaningful data — see `verdict-math.ts` `computeVerdicts`), an inline
   * "selected AY may differ" note renders under the cycle header so the
   * Director is never confused about why KPI cards show one AY and the verdict
   * shows another.
   *
   * Director-locked 2026-06-03 (Option b — label, don't filter): we don't
   * change the verdict math because a young cycle with N=11 admits has no
   * actionable insight; we just make the anchor explicit. The Days-to-Catch-Up
   * panel below already projects the selected AY's own pace.
   */
  selectedAY?: number | null;
};

const DIRECTION_STYLE: Record<
  Verdict['direction'],
  { fg: string; bg: string; icon: typeof TrendingDown }
> = {
  behind: { fg: '#a8453c', bg: 'rgba(168, 69, 60, 0.08)', icon: TrendingDown },
  'on-par': { fg: '#7c8a93', bg: 'rgba(124, 138, 147, 0.08)', icon: Minus },
  ahead: { fg: '#5a7548', bg: 'rgba(90, 117, 72, 0.08)', icon: TrendingUp },
};

/**
 * Zone 1: the verdict banner. Director's primary question answered in the
 * first sentence. Big serif headline, monospace numbers, side-by-side
 * statements (one per prior comparison year).
 *
 * NO chart here. No axes. No noise. Just the verdict.
 */
export function YoYVerdictBanner({ trajectory, isLoading, selectedAY }: Props) {
  const verdicts = computeVerdicts(trajectory);
  const projection = computeProjectionVerdict(trajectory);
  const weekPace = computeWeekPaceVerdict(trajectory);

  if (isLoading) {
    return <VerdictSkeleton />;
  }

  if (!verdicts.length) {
    return (
      <div
        className="rounded-lg border px-6 py-5 text-sm text-muted-foreground"
        style={{
          backgroundColor: '#fafaf8',
          borderColor: '#e7e2d8',
          fontFamily: 'var(--font-ibm-plex-sans)',
        }}
      >
        Building verdict — need at least 2 cycles of admission data.
      </div>
    );
  }

  // The anchored cycle = year+1 of the prior-year being compared against in
  // computeVerdicts. NB: computeVerdicts picks the MAX year in trajectory data
  // as currentYear, NOT the user-selected AY (verdict-math.ts L38).
  const anchoredYear = verdicts[0]?.priorYear + 1;
  const currentCycle = cycleLabel(anchoredYear);
  // Reverse so newer prior year (more relevant) appears first
  const sortedVerdicts = verdicts.slice().reverse();

  // Option (b): when the user-selected AY differs from the anchored cycle,
  // surface that gap explicitly. We try to pull the selected AY's running
  // admit count straight from the trajectory rows (max cumulativeAdmitted
  // for year === selectedAY). If the selected AY isn't in the trajectory
  // (too sparse, filtered out upstream), the count line falls back to a
  // generic note that points to Days-to-Catch-Up below.
  const showSelectedAYNote =
    selectedAY != null &&
    Number.isFinite(selectedAY) &&
    selectedAY !== anchoredYear;
  const selectedAYAdmits = showSelectedAYNote
    ? trajectory
        .filter((r) => r.year === selectedAY)
        .reduce((m, r) => Math.max(m, r.cumulativeAdmitted), 0)
    : 0;
  const selectedAYInTrajectory =
    showSelectedAYNote && trajectory.some((r) => r.year === selectedAY);

  return (
    <div
      className="rounded-lg border"
      style={{
        backgroundColor: '#fafaf8',
        borderColor: '#e7e2d8',
        fontFamily: 'var(--font-ibm-plex-sans)',
      }}
    >
      <div
        className="px-6 pt-4 pb-1 text-[10px] uppercase tracking-[0.18em]"
        style={{ color: '#9a948a', letterSpacing: '0.18em' }}
      >
        {showSelectedAYNote ? 'Verdict on latest active cycle · ' : 'Cycle '}
        {currentCycle} · day {verdicts[0]?.comparedAtDayN >= 0 ? '+' : ''}{verdicts[0]?.comparedAtDayN ?? 0} since April 1
      </div>
      {showSelectedAYNote && (
        <div
          className="px-6 pb-2 text-[11px]"
          style={{
            color: '#6e6760',
            fontFamily: 'var(--font-ibm-plex-sans)',
            fontStyle: 'italic',
          }}
        >
          {selectedAYInTrajectory ? (
            <>
              Selected AY {cycleLabel(selectedAY!)} has{' '}
              <span
                className="tabular-nums"
                style={{ fontFamily: 'var(--font-ibm-plex-mono)', fontStyle: 'normal' }}
              >
                {formatIndianNumber(selectedAYAdmits)}
              </span>{' '}
              {selectedAYAdmits === 1 ? 'admit' : 'admits'} so far — see Days to Catch Up below for its pace projection.
            </>
          ) : (
            <>
              Selected AY {cycleLabel(selectedAY!)} differs from the anchored cycle. See Days to Catch Up below for its pace projection.
            </>
          )}
        </div>
      )}

      <div className="grid divide-y sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-y-0" style={{ borderColor: '#e7e2d8' }}>
        {sortedVerdicts.map((v) => (
          <VerdictCard key={v.priorYear} verdict={v} />
        ))}
        {projection && <ProjectionCard verdict={projection} priorCycleLabel={cycleLabel(sortedVerdicts[0]?.priorYear ?? 0)} />}
        {weekPace && <WeekPaceCard verdict={weekPace} priorCycleLabel={cycleLabel(sortedVerdicts[0]?.priorYear ?? 0)} />}
      </div>
    </div>
  );
}

function ProjectionCard({ verdict, priorCycleLabel }: { verdict: ProjectionVerdict; priorCycleLabel: string }) {
  const style = DIRECTION_STYLE[verdict.direction];
  return (
    <div className="px-6 py-5">
      <div className="flex items-baseline gap-2">
        <Target size={14} style={{ color: style.fg }} aria-hidden="true" className="self-center" />
        <span
          className="text-[13px] tracking-wide"
          style={{ color: '#9a948a', fontFamily: 'var(--font-ibm-plex-sans)' }}
        >
          Projected final
        </span>
      </div>

      <div
        className="mt-1.5 leading-[1.1] tabular-nums"
        style={{
          fontFamily: 'var(--font-dm-serif-display)',
          fontSize: 'clamp(1.5rem, 2.2vw, 2rem)',
          color: '#2a2624',
        }}
      >
        ≈ <span style={{ color: style.fg }}>{formatIndianNumber(verdict.projected)}</span>
      </div>

      <div
        className="mt-3 flex items-baseline gap-3"
        style={{ fontFamily: 'var(--font-ibm-plex-mono)' }}
      >
        <div
          className="rounded-md px-2 py-1 text-[12px] font-medium tabular-nums"
          style={{ backgroundColor: style.bg, color: style.fg }}
        >
          {verdict.direction === 'behind' && `▼ ${formatIndianNumber(Math.abs(verdict.delta))} below`}
          {verdict.direction === 'ahead' && `▲ ${formatIndianNumber(Math.abs(verdict.delta))} above`}
          {verdict.direction === 'on-par' && `≈ on par`}
        </div>
        <div className="text-[11px] tabular-nums" style={{ color: '#6e6760' }}>
          vs {priorCycleLabel} ended at {formatIndianNumber(verdict.priorFinal)}
        </div>
      </div>
    </div>
  );
}

function WeekPaceCard({ verdict, priorCycleLabel }: { verdict: WeekPaceVerdict; priorCycleLabel: string }) {
  const style = DIRECTION_STYLE[verdict.direction];
  const thisWeekRate = (verdict.thisWeek / 7).toFixed(1);
  const lyWeekRate = (verdict.sameWeekLastYear / 7).toFixed(1);
  return (
    <div className="px-6 py-5">
      <div className="flex items-baseline gap-2">
        <Zap size={14} style={{ color: style.fg }} aria-hidden="true" className="self-center" />
        <span
          className="text-[13px] tracking-wide"
          style={{ color: '#9a948a', fontFamily: 'var(--font-ibm-plex-sans)' }}
        >
          This week pace
        </span>
      </div>

      <div
        className="mt-1.5 leading-[1.1] tabular-nums"
        style={{
          fontFamily: 'var(--font-dm-serif-display)',
          fontSize: 'clamp(1.5rem, 2.2vw, 2rem)',
          color: '#2a2624',
        }}
      >
        <span style={{ color: style.fg }}>{thisWeekRate}</span>
        <span style={{ color: '#9a948a', fontSize: '0.8em' }}>/day</span>
      </div>

      <div
        className="mt-3 flex items-baseline gap-3"
        style={{ fontFamily: 'var(--font-ibm-plex-mono)' }}
      >
        <div
          className="rounded-md px-2 py-1 text-[12px] font-medium tabular-nums"
          style={{ backgroundColor: style.bg, color: style.fg }}
        >
          {verdict.direction === 'behind' && `▼ ${formatDeltaPct(verdict.deltaPct)}`}
          {verdict.direction === 'ahead' && `▲ ${formatDeltaPct(verdict.deltaPct)}`}
          {verdict.direction === 'on-par' && `≈ same`}
        </div>
        <div className="text-[11px] tabular-nums" style={{ color: '#6e6760' }}>
          vs {lyWeekRate}/day same week {priorCycleLabel}
        </div>
      </div>
    </div>
  );
}

function VerdictCard({ verdict }: { verdict: Verdict }) {
  const style = DIRECTION_STYLE[verdict.direction];
  const Icon = style.icon;
  const verb =
    verdict.direction === 'behind' ? 'Behind' :
    verdict.direction === 'ahead' ? 'Ahead of' : 'On par with';
  const absDelta = Math.abs(verdict.delta);

  return (
    <div className="px-6 py-5">
      <div className="flex items-baseline gap-2">
        <Icon size={18} style={{ color: style.fg }} aria-hidden="true" className="self-center" />
        <span
          className="text-[13px] tracking-wide"
          style={{ color: '#9a948a', fontFamily: 'var(--font-ibm-plex-sans)' }}
        >
          vs {cycleLabel(verdict.priorYear)}
        </span>
      </div>

      <div
        className="mt-1.5 leading-[1.1]"
        style={{
          fontFamily: 'var(--font-dm-serif-display)',
          fontSize: 'clamp(1.5rem, 2.2vw, 2rem)',
          color: '#2a2624',
        }}
      >
        {verb}{' '}
        <span style={{ color: style.fg }}>
          {verdict.direction === 'on-par' ? '' : (
            <>{formatDeltaPct(verdict.deltaPct).replace(/[+-]/, '')}</>
          )}
        </span>
      </div>

      <div
        className="mt-3 flex items-baseline gap-3"
        style={{ fontFamily: 'var(--font-ibm-plex-mono)' }}
      >
        <div
          className="rounded-md px-2 py-1 text-[12px] font-medium tabular-nums"
          style={{ backgroundColor: style.bg, color: style.fg }}
        >
          {verdict.direction === 'behind' && `▼ ${formatIndianNumber(absDelta)} to catch up`}
          {verdict.direction === 'ahead' && `▲ ${formatIndianNumber(absDelta)} more`}
          {verdict.direction === 'on-par' && `≈ ${formatIndianNumber(absDelta)} ${verdict.delta < 0 ? 'behind' : 'ahead'}`}
        </div>
        <div className="text-[11px] tabular-nums" style={{ color: '#6e6760' }}>
          {formatIndianNumber(verdict.currentValue)} vs {formatIndianNumber(verdict.priorValue)} at same day
        </div>
      </div>
    </div>
  );
}

function VerdictSkeleton() {
  return (
    <div
      className="rounded-lg border"
      style={{ backgroundColor: '#fafaf8', borderColor: '#e7e2d8' }}
    >
      <div className="px-6 pt-4 pb-2">
        <div className="h-3 w-32 animate-pulse rounded bg-[#ece8de]" />
      </div>
      <div className="grid sm:grid-cols-2 sm:divide-x" style={{ borderColor: '#e7e2d8' }}>
        {[0, 1].map((i) => (
          <div key={i} className="px-6 py-5">
            <div className="h-3 w-20 animate-pulse rounded bg-[#ece8de]" />
            <div className="mt-3 h-8 w-48 animate-pulse rounded bg-[#ece8de]" />
            <div className="mt-4 h-5 w-36 animate-pulse rounded bg-[#ece8de]" />
          </div>
        ))}
      </div>
    </div>
  );
}
