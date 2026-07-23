'use client';

import { useYoYDepositsLeaking } from '@/hooks/admission/use-yoy-trajectory';
import { ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { formatIndianNumber } from './_helpers/chart-formatters';
import type { YoYDepositLeak } from '@/lib/services/admission/yoy-trajectory-service';

type Props = {
  institutionId: string | undefined;
};

/**
 * Deposits-Leaking Worklist — top 5 programs by paid-deposit-not-yet-admitted
 * count. Each row is a named counsellor reassignment for tomorrow.
 */
export function YoYDepositsWorklist({ institutionId }: Props) {
  const { data, isLoading } = useYoYDepositsLeaking(institutionId, 5);

  if (isLoading) return <WorklistSkeleton />;
  if (!data?.length) {
    return null;
  }

  const max = data[0]?.reservedCount ?? 1;

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
        <h3
          className="text-[14px] tracking-tight"
          style={{
            fontFamily: 'var(--font-dm-serif-display)',
            color: '#2a2624',
            fontWeight: 400,
          }}
        >
          Deposits Leaking — programs to call today
        </h3>
        <p className="text-[11px]" style={{ color: '#9a948a' }}>
          Top 5 programs ranked by reserved learners who haven't moved to admitted yet · sorted by 14-day stall count
        </p>
      </div>

      <div className="divide-y" style={{ borderColor: '#e7e2d8' }}>
        {data.map((row, idx) => (
          <WorklistRow key={row.programId} row={row} rank={idx + 1} max={max} />
        ))}
      </div>
    </div>
  );
}

function WorklistRow({ row, rank, max }: { row: YoYDepositLeak; rank: number; max: number }) {
  const router = useRouter();
  const pct = max > 0 ? (row.reservedCount / max) * 100 : 0;
  const instShort = row.institutionName
    .replace(/^JKKN College of /i, '')
    .replace(/^JKKN /i, '');
  const isHotStall = row.stale14dCount > 5 || row.avgStaleDays > 14;

  // The worklist row represents a PROGRAM with N reserved learners. The action
  // "Call" can't be fired against a program — it has to land on the individual
  // learners. Drill into /admission/leads filtered to this program, where the
  // existing per-row Call CTA (PR #821 — Exotel + admission_call_logs) handles
  // the actual per-learner call. funnel_stage=token_paid is the CRM-side
  // closest match for "deposit paid, not yet admitted"; the YoY worklist
  // counts the lifecycle_status='reserved' side of the taxonomy (different
  // table), but token_paid is the right narrowing on /admission/leads.
  const handleWorkList = () => {
    router.push(
      `/admission/leads?program_id=${encodeURIComponent(row.programId)}&funnel_stage=token_paid`
    );
  };

  return (
    <div className="px-5 py-3.5 transition hover:bg-[#f4efe3]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span
              className="tabular-nums text-[11px] font-medium"
              style={{ color: '#b8b1a4', fontFamily: 'var(--font-ibm-plex-mono)', minWidth: 16 }}
            >
              #{rank}
            </span>
            <span className="text-[13px] font-medium" style={{ color: '#2a2624' }}>
              {row.programName}
            </span>
          </div>
          <div className="ml-5 text-[10.5px]" style={{ color: '#9a948a' }}>
            {instShort}
          </div>
        </div>
        <button
          type="button"
          onClick={handleWorkList}
          className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium transition hover:opacity-90"
          style={{
            borderColor: '#c8553d',
            backgroundColor: '#c8553d',
            color: '#fafaf8',
            fontFamily: 'var(--font-ibm-plex-mono)',
          }}
        >
          Work this list
          <ChevronRight size={11} />
        </button>
      </div>

      <div className="mt-2.5 ml-5">
        <div
          className="flex items-baseline gap-3 text-[11px] tabular-nums"
          style={{ fontFamily: 'var(--font-ibm-plex-mono)', color: '#6e6760' }}
        >
          <span style={{ color: '#2a2624', fontWeight: 600 }}>
            {formatIndianNumber(row.reservedCount)} reserved
          </span>
          <span>·</span>
          <span>{formatIndianNumber(row.admittedCount)} admitted</span>
          <span>·</span>
          <span style={{ color: isHotStall ? '#a8453c' : '#6e6760' }}>
            {formatIndianNumber(row.stale14dCount)} stale 14d
          </span>
          <span>·</span>
          <span>avg {row.avgStaleDays}d idle</span>
        </div>
        <div className="mt-1.5 h-[3px] rounded-full" style={{ backgroundColor: '#ece8de' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, backgroundColor: '#c8553d' }}
          />
        </div>
      </div>
    </div>
  );
}

function WorklistSkeleton() {
  return (
    <div
      className="rounded-lg border p-5 space-y-3"
      style={{ backgroundColor: '#fafaf8', borderColor: '#e7e2d8' }}
    >
      <div className="h-4 w-48 animate-pulse rounded bg-[#ece8de]" />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded bg-[#ece8de]" />
      ))}
    </div>
  );
}
