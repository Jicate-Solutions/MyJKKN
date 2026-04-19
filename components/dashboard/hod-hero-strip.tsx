'use client';

import { useEffect, useState } from 'react';
import {
  HodMetrics,
  HodMetricsService
} from '@/lib/services/dashboard/hod-metrics-service';
import { Users, ClipboardCheck, AlertTriangle, CalendarClock } from 'lucide-react';

// ── Tile colour classes (duplicated per spec; do NOT import from hero-strip) ──
const TILE_COLORS = {
  attendance: {
    good: 'border-emerald-400/40 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-950 dark:text-emerald-100',
    bad: 'border-rose-400/40 bg-rose-50/60 dark:bg-rose-950/30 text-rose-950 dark:text-rose-100'
  },
  compliance: 'border-blue-400/40 bg-blue-50/60 dark:bg-blue-950/30 text-blue-950 dark:text-blue-100',
  grievance: 'border-amber-400/40 bg-amber-50/60 dark:bg-amber-950/30 text-amber-950 dark:text-amber-100',
  leave: 'border-purple-400/40 bg-purple-50/60 dark:bg-purple-950/30 text-purple-950 dark:text-purple-100'
} as const;

function TileSkeleton() {
  return (
    <div className='rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm p-5 animate-pulse'>
      <div className='h-3 w-1/3 bg-neutral-200 dark:bg-neutral-800 rounded' />
      <div className='mt-4 h-8 w-1/2 bg-neutral-200 dark:bg-neutral-800 rounded' />
      <div className='mt-3 h-2 w-3/4 bg-neutral-100 dark:bg-neutral-900 rounded' />
    </div>
  );
}

export default function HodHeroStrip() {
  const [metrics, setMetrics] = useState<HodMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    HodMetricsService.getMetrics().then((m) => {
      if (!cancelled) {
        setMetrics(m);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4'>
        {[0, 1, 2, 3].map((i) => (
          <TileSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!metrics) return null;

  const aboveBaseline =
    metrics.dept_attendance_pct >= metrics.attendance_baseline;

  return (
    <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4'>
      {/* Tile 1 — Dept Attendance vs Baseline */}
      <div
        className={`rounded-2xl border p-5 backdrop-blur-sm transition-all duration-200 ${
          aboveBaseline
            ? TILE_COLORS.attendance.good
            : TILE_COLORS.attendance.bad
        }`}
      >
        <div className='flex items-center gap-2 text-[11px] uppercase tracking-wider opacity-70'>
          <Users className='h-3.5 w-3.5' />
          Dept Attendance
        </div>
        <div className='mt-3 text-3xl font-semibold tabular-nums'>
          {metrics.dept_attendance_pct}%
        </div>
        <div className='mt-1 text-xs opacity-60'>
          Baseline {metrics.attendance_baseline}%
        </div>
      </div>

      {/* Tile 2 — Faculty Marking Compliance */}
      <div
        className={`rounded-2xl border p-5 backdrop-blur-sm transition-all duration-200 ${TILE_COLORS.compliance}`}
      >
        <div className='flex items-center gap-2 text-[11px] uppercase tracking-wider opacity-70'>
          <ClipboardCheck className='h-3.5 w-3.5' />
          Marking Compliance
        </div>
        <div className='mt-3 text-3xl font-semibold tabular-nums'>
          {metrics.marking_compliance_pct}%
        </div>
        <div className='mt-1 text-xs opacity-60'>Sections marked today</div>
      </div>

      {/* Tile 3 — Open Grievances */}
      <div
        className={`rounded-2xl border p-5 backdrop-blur-sm transition-all duration-200 ${TILE_COLORS.grievance}`}
      >
        <div className='flex items-center gap-2 text-[11px] uppercase tracking-wider opacity-70'>
          <AlertTriangle className='h-3.5 w-3.5' />
          Open Grievances
        </div>
        <div className='mt-3 text-3xl font-semibold tabular-nums'>
          {metrics.open_grievances}
        </div>
        <div className='mt-1 text-xs opacity-60'>
          {metrics.open_grievances === 0 ? 'All clear' : 'Needs attention'}
        </div>
      </div>

      {/* Tile 4 — Pending Leave Approvals */}
      <div
        className={`rounded-2xl border p-5 backdrop-blur-sm transition-all duration-200 ${TILE_COLORS.leave}`}
      >
        <div className='flex items-center gap-2 text-[11px] uppercase tracking-wider opacity-70'>
          <CalendarClock className='h-3.5 w-3.5' />
          Leave Approvals
        </div>
        <div className='mt-3 text-3xl font-semibold tabular-nums'>
          {metrics.pending_leave_approvals}
        </div>
        <div className='mt-1 text-xs opacity-60'>
          {metrics.pending_leave_approvals === 0
            ? 'No pending'
            : 'Pending review'}
        </div>
      </div>
    </div>
  );
}
