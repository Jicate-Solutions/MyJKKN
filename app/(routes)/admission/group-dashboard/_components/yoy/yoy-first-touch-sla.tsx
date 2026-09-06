'use client';

import { useMemo } from 'react';
import { useYoYFirstTouchBreaches } from '@/hooks/admission/use-yoy-trajectory';
import { AlertTriangle } from 'lucide-react';
import { formatIndianNumber } from './_helpers/chart-formatters';

type Props = {
  institutionId: string | undefined;
};

/**
 * First-Touch SLA Breach List — leads captured but with no activity within
 * 48h of capture. Surfaces routing-rule failures + counsellor unresponsiveness.
 */
export function YoYFirstTouchSLA({ institutionId }: Props) {
  const { data, isLoading } = useYoYFirstTouchBreaches(institutionId, 7);

  const { total, byInstitution, byCounselor } = useMemo(() => {
    if (!data?.length) {
      return { total: 0, byInstitution: [], byCounselor: [] };
    }
    const total = data.find((r) => r.kind === 'total')?.breachCount ?? 0;
    const byInstitution = data.filter((r) => r.kind === 'by_institution' && r.institutionName)
      .sort((a, b) => b.breachCount - a.breachCount).slice(0, 6);
    const byCounselor = data.filter((r) => r.kind === 'by_counselor')
      .sort((a, b) => b.breachCount - a.breachCount).slice(0, 6);
    return { total, byInstitution, byCounselor };
  }, [data]);

  if (isLoading) return <SLASkeleton />;
  if (total === 0) return null;

  const instMax = byInstitution[0]?.breachCount ?? 1;
  const cslMax = byCounselor[0]?.breachCount ?? 1;

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{
        backgroundColor: '#fafaf8',
        borderColor: '#e7e2d8',
        fontFamily: 'var(--font-ibm-plex-sans)',
      }}
    >
      <div className="px-5 py-3 border-b" style={{ borderColor: '#e7e2d8' }}>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h3
              className="text-[14px] tracking-tight flex items-center gap-2"
              style={{
                fontFamily: 'var(--font-dm-serif-display)',
                color: '#2a2624',
                fontWeight: 400,
              }}
            >
              <AlertTriangle size={14} style={{ color: '#a8453c' }} />
              First-Touch SLA Breaches
            </h3>
            <p className="text-[11px]" style={{ color: '#9a948a' }}>
              Leads captured in last 7 days with zero activity in first 48h
            </p>
          </div>
          <div
            className="text-right tabular-nums"
            style={{ fontFamily: 'var(--font-ibm-plex-mono)' }}
          >
            <div
              className="text-[24px] leading-none"
              style={{
                color: '#a8453c',
                fontFamily: 'var(--font-dm-serif-display)',
              }}
            >
              {formatIndianNumber(total)}
            </div>
            <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: '#9a948a' }}>
              total breaches
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x" style={{ borderColor: '#e7e2d8' }}>
        <BreachBreakdown title="By counsellor" rows={byCounselor.map((r) => ({ label: r.counselorName || 'Unassigned', value: r.breachCount }))} max={cslMax} />
        <BreachBreakdown title="By institution" rows={byInstitution.map((r) => ({ label: r.institutionName, value: r.breachCount }))} max={instMax} />
      </div>
    </div>
  );
}

function BreachBreakdown({
  title,
  rows,
  max,
}: {
  title: string;
  rows: { label: string; value: number }[];
  max: number;
}) {
  return (
    <div className="p-4">
      <div
        className="text-[10px] uppercase tracking-[0.16em] mb-2.5"
        style={{ color: '#9a948a' }}
      >
        {title}
      </div>
      <div className="space-y-1.5">
        {rows.length === 0 && (
          <div className="text-[11.5px]" style={{ color: '#9a948a' }}>
            No breaches by this dimension
          </div>
        )}
        {rows.map((r, idx) => {
          const pct = max > 0 ? (r.value / max) * 100 : 0;
          const isHigh = r.value >= max * 0.6;
          return (
            <div key={`${r.label}-${idx}`} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3">
                <div
                  className="text-[12px] truncate"
                  style={{ color: '#2a2624', fontFamily: 'var(--font-ibm-plex-sans)' }}
                >
                  {shortenLabel(r.label)}
                </div>
                <div
                  className="tabular-nums text-[12px] font-medium"
                  style={{
                    color: isHigh ? '#a8453c' : '#2a2624',
                    fontFamily: 'var(--font-ibm-plex-mono)',
                  }}
                >
                  {formatIndianNumber(r.value)}
                </div>
              </div>
              <div className="h-[3px] rounded-full" style={{ backgroundColor: '#ece8de' }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, backgroundColor: isHigh ? '#a8453c' : '#c8553d' }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function shortenLabel(label: string): string {
  return label
    .replace(/^JKKN College of /i, '')
    .replace(/^JKKN /i, '')
    .replace(/and Technology$/, 'Tech')
    .replace(/and Research$/, '')
    .replace(/and Hospital$/, '')
    .replace(/Sciences$/, 'Sci');
}

function SLASkeleton() {
  return (
    <div
      className="rounded-lg border p-5 space-y-3"
      style={{ backgroundColor: '#fafaf8', borderColor: '#e7e2d8' }}
    >
      <div className="h-4 w-48 animate-pulse rounded bg-[#ece8de]" />
      <div className="grid grid-cols-2 gap-4">
        {[0, 1].map((s) => (
          <div key={s} className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-7 animate-pulse rounded bg-[#ece8de]" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
