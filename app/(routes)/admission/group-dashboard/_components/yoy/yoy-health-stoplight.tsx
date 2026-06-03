'use client';

import { useYoYInstitutionHealth } from '@/hooks/admission/use-yoy-trajectory';
import { formatIndianNumber, formatDeltaPct } from './_helpers/chart-formatters';
import type { YoYHealthSignal } from '@/lib/services/admission/yoy-trajectory-service';

type Props = {
  institutionId: string | undefined;
};

const SIGNAL_STYLE: Record<YoYHealthSignal['signal'], { fg: string; bg: string; chip: string }> = {
  RED:   { fg: '#a8453c', bg: 'rgba(168, 69, 60, 0.10)', chip: '#a8453c' },
  AMBER: { fg: '#8b6c42', bg: 'rgba(139, 108, 66, 0.10)', chip: '#c89055' },
  GREEN: { fg: '#5a7548', bg: 'rgba(90, 117, 72, 0.10)', chip: '#5a7548' },
  NA:    { fg: '#9a948a', bg: 'rgba(154, 148, 138, 0.06)', chip: '#9a948a' },
};

/**
 * 8-College Health Stoplight — top-1 actionable insight per workflow scoring.
 * One row per college, colored Red/Amber/Green by worst-of-3 signal rule.
 * Director scans in 2s, sees which Principals to call today.
 */
export function YoYHealthStoplight({ institutionId }: Props) {
  const { data, isLoading } = useYoYInstitutionHealth(institutionId);

  if (isLoading) return <StoplightSkeleton />;
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
            Institution Health
          </h3>
          <p className="text-[11px]" style={{ color: '#9a948a' }}>
            Color = worst of (pace vs last year · fill % vs intake · reserved-stall count)
          </p>
        </div>
        <Legend />
      </div>

      <div className="divide-y" style={{ borderColor: '#e7e2d8' }}>
        {data.map((row) => (
          <StoplightRow key={row.institutionId} row={row} />
        ))}
      </div>
    </div>
  );
}

function StoplightRow({ row }: { row: YoYHealthSignal }) {
  const style = SIGNAL_STYLE[row.signal];
  const shortName = row.institutionName
    .replace(/^JKKN College of /i, '')
    .replace(/^JKKN /i, '')
    .replace(/and Technology$/, 'Tech')
    .replace(/and Research$/, '')
    .replace(/and Hospital$/, '')
    .replace(/Sciences$/, 'Sci');

  return (
    <div
      className="grid grid-cols-12 items-center gap-2 px-5 py-3 transition hover:bg-[#f4efe3]"
      style={{ backgroundColor: row.signal === 'RED' || row.signal === 'AMBER' ? style.bg : 'transparent' }}
    >
      <div className="col-span-1">
        <span
          className="inline-block rounded-full px-2 py-0.5 text-[9.5px] font-bold tracking-[0.12em]"
          style={{ backgroundColor: style.chip, color: '#fff', fontFamily: 'var(--font-ibm-plex-mono)' }}
        >
          {row.signal}
        </span>
      </div>
      <div className="col-span-3">
        <div className="text-[13px] font-medium" style={{ color: '#2a2624' }}>{shortName}</div>
        <div className="text-[10px]" style={{ color: '#9a948a' }}>{row.institutionName}</div>
      </div>
      <div className="col-span-2 text-right tabular-nums" style={{ fontFamily: 'var(--font-ibm-plex-mono)' }}>
        <div className="text-[12.5px]" style={{ color: '#2a2624' }}>
          {row.fillPctCurrent !== null ? `${row.fillPctCurrent}%` : '—'}
        </div>
        <div className="text-[10px]" style={{ color: '#9a948a' }}>
          {row.priorYearAdmittedSameDay > 0 ? `LY ${row.fillPctPriorSameDay}%` : 'no LY data'}
        </div>
      </div>
      <div className="col-span-2 text-right tabular-nums" style={{ fontFamily: 'var(--font-ibm-plex-mono)' }}>
        <div
          className="text-[12.5px]"
          style={{ color: row.paceDeltaPct !== null && row.paceDeltaPct < 0 ? '#a8453c' : '#5a7548' }}
        >
          {row.paceDeltaPct !== null ? formatDeltaPct(row.paceDeltaPct) + 'pp' : '—'}
        </div>
        <div className="text-[10px]" style={{ color: '#9a948a' }}>pace δ</div>
      </div>
      <div className="col-span-2 text-right tabular-nums" style={{ fontFamily: 'var(--font-ibm-plex-mono)' }}>
        <div className="text-[12.5px]" style={{ color: '#2a2624' }}>
          {formatIndianNumber(row.currentAdmitted)} / {formatIndianNumber(row.sanctionedIntake)}
        </div>
        <div className="text-[10px]" style={{ color: '#9a948a' }}>admitted / intake</div>
      </div>
      <div className="col-span-2 text-right tabular-nums" style={{ fontFamily: 'var(--font-ibm-plex-mono)' }}>
        <div
          className="text-[12.5px]"
          style={{ color: row.staleReservedCount > 10 ? '#a8453c' : '#2a2624' }}
        >
          {formatIndianNumber(row.staleReservedCount)} stale
        </div>
        <div className="text-[10px]" style={{ color: '#9a948a' }}>
          of {formatIndianNumber(row.reservedCount)} reserved
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

function StoplightSkeleton() {
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
