'use client';

import { useYoYDaysToCatchUp } from '@/hooks/admission/use-yoy-trajectory';
import { formatIndianNumber } from './_helpers/chart-formatters';
import type { YoYDaysToCatchUp as YoYDaysToCatchUpRow } from '@/lib/services/admission/yoy-trajectory-service';

type Props = {
  institutionId: string | undefined;
};

const SIGNAL_STYLE: Record<YoYDaysToCatchUpRow['signal'], { fg: string; bg: string; chip: string }> = {
  RED:   { fg: '#a8453c', bg: 'rgba(168, 69, 60, 0.10)', chip: '#a8453c' },
  AMBER: { fg: '#8b6c42', bg: 'rgba(139, 108, 66, 0.10)', chip: '#c89055' },
  GREEN: { fg: '#5a7548', bg: 'rgba(90, 117, 72, 0.10)', chip: '#5a7548' },
  NA:    { fg: '#9a948a', bg: 'rgba(154, 148, 138, 0.06)', chip: '#9a948a' },
};

/**
 * Days-to-Catch-Up Countdown — 5th actionable view.
 * One row per JKKN college. For each, compute:
 *   gap = LY final - current admitted
 *   pace = avg admissions/day over last 7d
 *   daysToCatchUp = CEIL(gap / pace)
 *   daysRemaining = window-end (Aug 31) - today
 * Signal: RED if daysToCatchUp > daysRemaining (won't make it at this rate),
 *         AMBER if daysToCatchUp <= daysRemaining (tight),
 *         GREEN if daysToCatchUp <= 70% of daysRemaining (comfortable) OR gap <= 0,
 *         NA if no LY data.
 */
export function YoYDaysToCatchUp({ institutionId }: Props) {
  const { data, isLoading } = useYoYDaysToCatchUp(institutionId);

  if (isLoading) return <CountdownSkeleton />;
  if (!data?.length) return null;

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{
        backgroundColor: '#fafaf8',
        borderColor: '#e7e2d8',
        fontFamily: 'var(--font-ibm-plex-sans)',
      }}
    >
      <div
        className="flex items-center justify-between px-5 py-3 border-b"
        style={{ borderColor: '#e7e2d8' }}
      >
        <div>
          <h3
            className="text-[14px] tracking-tight"
            style={{
              fontFamily: 'var(--font-dm-serif-display)',
              color: '#2a2624',
              fontWeight: 400,
            }}
          >
            Days to Catch Up
          </h3>
          <p className="text-[11px]" style={{ color: '#9a948a' }}>
            Current pace vs. last year&apos;s final — days needed at this rate vs. days left in cycle
          </p>
        </div>
        <Legend />
      </div>

      <div className="divide-y" style={{ borderColor: '#e7e2d8' }}>
        {data.map((row) => (
          <CountdownRow key={row.institutionId} row={row} />
        ))}
      </div>
    </div>
  );
}

function CountdownRow({ row }: { row: YoYDaysToCatchUpRow }) {
  const style = SIGNAL_STYLE[row.signal];
  const shortName = row.institutionName
    .replace(/^JKKN College of /i, '')
    .replace(/^JKKN /i, '')
    .replace(/and Technology$/, 'Tech')
    .replace(/and Research$/, '')
    .replace(/and Hospital$/, '')
    .replace(/Sciences$/, 'Sci');

  const behind = row.gap > 0;
  const pastLy = row.gap < 0;

  return (
    <div
      className="grid grid-cols-12 items-center gap-2 px-5 py-3 transition hover:bg-[#f4efe3]"
      style={{ backgroundColor: row.signal === 'RED' || row.signal === 'AMBER' ? style.bg : 'transparent' }}
    >
      {/* col 1 — signal chip */}
      <div className="col-span-1">
        <span
          className="inline-block rounded-full px-2 py-0.5 text-[9.5px] font-bold tracking-[0.12em]"
          style={{ backgroundColor: style.chip, color: '#fff', fontFamily: 'var(--font-ibm-plex-mono)' }}
        >
          {row.signal}
        </span>
      </div>

      {/* col 2-3 — institution */}
      <div className="col-span-2">
        <div className="text-[13px] font-medium" style={{ color: '#2a2624' }}>{shortName}</div>
        <div className="text-[10px]" style={{ color: '#9a948a' }}>{row.institutionName}</div>
      </div>

      {/* col 4-5 — gap */}
      <div className="col-span-2 text-right tabular-nums" style={{ fontFamily: 'var(--font-ibm-plex-mono)' }}>
        <div
          className="text-[12.5px]"
          style={{ color: behind ? '#a8453c' : pastLy ? '#5a7548' : '#2a2624' }}
        >
          {row.signal === 'NA'
            ? '—'
            : pastLy
              ? `+${formatIndianNumber(Math.abs(row.gap))} past LY`
              : behind
                ? `${formatIndianNumber(row.gap)} behind`
                : 'at LY total'}
        </div>
        <div className="text-[10px]" style={{ color: '#9a948a' }}>
          {row.signal === 'NA'
            ? 'no LY data'
            : `${formatIndianNumber(row.currentAdmitted)} of ${formatIndianNumber(row.priorFinal)} LY`}
        </div>
      </div>

      {/* col 6-7 — pace */}
      <div className="col-span-2 text-right tabular-nums" style={{ fontFamily: 'var(--font-ibm-plex-mono)' }}>
        <div className="text-[12.5px]" style={{ color: '#2a2624' }}>
          {row.dailyPaceLast7d.toFixed(1)}/day
        </div>
        <div className="text-[10px]" style={{ color: '#9a948a' }}>last 7d pace</div>
      </div>

      {/* col 8-9 — days to catch up */}
      <div className="col-span-2 text-right tabular-nums" style={{ fontFamily: 'var(--font-ibm-plex-mono)' }}>
        {row.daysToCatchUp === null ? (
          <>
            <div
              className="text-[12.5px]"
              style={{
                color:
                  row.signal === 'RED'
                    ? '#a8453c'
                    : row.signal === 'AMBER'
                      ? '#8b6c42'
                      : '#2a2624',
              }}
            >
              —
            </div>
            <div className="text-[10px]" style={{ color: '#9a948a' }}>to catch up</div>
          </>
        ) : row.daysToCatchUp > row.daysRemaining * 30 ? (
          <>
            <div className="text-[12.5px]" style={{ color: '#a8453c' }}>
              pace stalled
            </div>
            <div className="text-[10px]" style={{ color: '#9a948a' }}>would take 30+ cycles</div>
          </>
        ) : (
          <>
            <div
              className="text-[12.5px]"
              style={{
                color:
                  row.signal === 'RED'
                    ? '#a8453c'
                    : row.signal === 'AMBER'
                      ? '#8b6c42'
                      : '#2a2624',
              }}
            >
              {`${formatIndianNumber(row.daysToCatchUp)} days`}
            </div>
            <div className="text-[10px]" style={{ color: '#9a948a' }}>to catch up</div>
          </>
        )}
      </div>

      {/* col 10-12 — days remaining + projected */}
      <div className="col-span-3 text-right tabular-nums" style={{ fontFamily: 'var(--font-ibm-plex-mono)' }}>
        <div className="text-[12.5px]" style={{ color: '#2a2624' }}>
          {formatIndianNumber(row.daysRemaining)} days left
        </div>
        <div className="text-[10px]" style={{ color: '#9a948a' }}>
          projected {formatIndianNumber(row.projectedFinal)} by window end
        </div>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-2 text-[10px]" style={{ fontFamily: 'var(--font-ibm-plex-mono)' }}>
      {(['RED', 'AMBER', 'GREEN'] as const).map((sig) => (
        <span
          key={sig}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded"
          style={{ backgroundColor: SIGNAL_STYLE[sig].bg, color: SIGNAL_STYLE[sig].fg }}
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: SIGNAL_STYLE[sig].chip }}
          />
          {sig}
        </span>
      ))}
    </div>
  );
}

function CountdownSkeleton() {
  return (
    <div
      className="rounded-lg border p-5 space-y-2"
      style={{ backgroundColor: '#fafaf8', borderColor: '#e7e2d8' }}
    >
      <div className="h-4 w-40 animate-pulse rounded bg-[#ece8de]" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-12 animate-pulse rounded bg-[#ece8de]" />
      ))}
    </div>
  );
}
