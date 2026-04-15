/**
 * Dashboard v2 — Operational Nervous System
 * Day 2 (2026-04-15): live data wiring via fn_dashboard_metrics RPC.
 *
 * Spec: specs/myjkkn-dashboard-v2-spec.md
 * §7.1 Hero Strip — 4 tiles ✓
 * §7.2 Decision Queue — stubbed, wires Day 3
 * §7.4 Multi-institution drill-down — /dashboard/i/[instId]
 *
 * Old dashboard preserved at /dashboard/classic for 60-day grace.
 */

import Link from 'next/link';
import { Suspense } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { getDashboardMetrics } from '@/lib/services/dashboard/dashboard-metrics-service';
import { HeroStrip } from '@/components/dashboard/hero-strip';

export const revalidate = 30; // Re-fetch metrics every 30s (matches SLA leaderboard cadence)

// ============================================================================
// Server component: fetches live metrics, renders HeroStrip
// ============================================================================
async function LiveHeroStrip({
  institutionId,
  departmentId
}: {
  institutionId?: string;
  departmentId?: string;
}) {
  const metrics = await getDashboardMetrics({ institutionId, departmentId });
  const drillBase = institutionId
    ? `/dashboard/i/${institutionId}${departmentId ? `/d/${departmentId}` : ''}`
    : '/dashboard';
  return <HeroStrip metrics={metrics} drillBase={drillBase} />;
}

// ============================================================================
// Hero fallback (skeleton while metrics fetch)
// ============================================================================
function HeroSkeleton() {
  return (
    <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4'>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className='rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm p-5 animate-pulse'
        >
          <div className='h-3 w-1/3 bg-neutral-200 dark:bg-neutral-800 rounded' />
          <div className='mt-4 h-8 w-1/2 bg-neutral-200 dark:bg-neutral-800 rounded' />
          <div className='mt-3 h-2 w-3/4 bg-neutral-100 dark:bg-neutral-900 rounded' />
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Decision Queue placeholder — wires Day 3
// ============================================================================
function DecisionQueuePlaceholder() {
  return (
    <div
      id='decision-queue'
      className='rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm scroll-mt-24'
    >
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-5 border-b border-neutral-200 dark:border-neutral-800'>
        <div>
          <h2 className='text-lg font-semibold'>Decision Queue</h2>
          <p className='text-xs text-neutral-500 mt-1'>
            Items awaiting your action · auto-escalates to Chief of Staff after 2h
          </p>
        </div>
        <div className='flex flex-wrap gap-1.5'>
          {['All', 'Approvals', 'Escalations', 'Rescues', 'Anomalies'].map(
            (chip, i) => (
              <span
                key={chip}
                className={`px-2.5 py-1 text-xs rounded-full ${
                  i === 0
                    ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                }`}
              >
                {chip}
              </span>
            )
          )}
        </div>
      </div>
      <div className='p-8 text-center'>
        <div className='text-4xl mb-3'>✓</div>
        <div className='text-sm font-medium'>Queue wiring arrives Day 3</div>
        <div className='text-xs text-neutral-500 mt-2 max-w-md mx-auto leading-relaxed'>
          Approvals · Escalated complaints · Cold lead rescues · Anomalies
          requiring judgment. Each item ships with inline
          Approve/Reject/Delegate/Snooze actions. Powered by existing{' '}
          <code className='px-1 rounded bg-neutral-100 dark:bg-neutral-800 text-[11px]'>
            notifications
          </code>{' '}
          +{' '}
          <code className='px-1 rounded bg-neutral-100 dark:bg-neutral-800 text-[11px]'>
            user_notifications
          </code>{' '}
          (19,494 live rows).
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Build banner (visible Day 1–5, removed at ship time)
// ============================================================================
function BuildBanner() {
  return (
    <div className='rounded-xl border border-blue-500/30 bg-blue-50/60 dark:bg-blue-950/20 p-4'>
      <div className='flex items-start gap-3'>
        <span className='text-lg leading-none'>🏗️</span>
        <div className='flex-1 text-sm'>
          <div className='font-semibold text-blue-900 dark:text-blue-100'>
            Dashboard v2 — Day 2 · Live Hero Strip
          </div>
          <div className='text-blue-800/80 dark:text-blue-200/80 mt-1 leading-relaxed'>
            Hero tiles reading live metrics from{' '}
            <code className='px-1 rounded bg-blue-100/60 dark:bg-blue-900/40 text-[11px]'>
              fn_dashboard_metrics
            </code>{' '}
            RPC (one round-trip, 4 tiles). Decision queue + inline actions
            arrive Day 3. Broadcast rescue + leaderboards + push Day 4. Morning
            brief + polish Day 5. Old dashboard still at{' '}
            <Link
              href='/dashboard/classic'
              className='font-semibold underline decoration-blue-400 hover:text-blue-700'
            >
              /dashboard/classic
            </Link>
            .
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main page (server component — fetches RPC, renders)
// ============================================================================
export default function DashboardV2Page() {
  return (
    <ContentLayout title='Dashboard'>
      {/* Animated glass background */}
      <div className='fixed inset-0 -z-10 overflow-hidden pointer-events-none'>
        <div className='absolute inset-0 bg-gradient-to-br from-emerald-50/40 via-white/20 to-sky-50/40 dark:from-emerald-950/30 dark:via-neutral-950/20 dark:to-sky-950/30' />
        <div className='absolute -top-1/2 -right-1/2 w-full h-full bg-gradient-to-br from-emerald-400/10 via-transparent to-sky-400/10 blur-3xl animate-blob' />
      </div>

      <div className='space-y-4 sm:space-y-5 lg:space-y-6 px-2 sm:px-3 lg:px-4 pb-10'>
        <BuildBanner />

        {/* Hero Strip — 4 tiles with live data (spec §7.1) */}
        <Suspense fallback={<HeroSkeleton />}>
          <LiveHeroStrip />
        </Suspense>

        {/* Decision Queue (spec §7.2) — wires Day 3 */}
        <DecisionQueuePlaceholder />

        {/* Footer link to classic */}
        <div className='text-center text-xs text-neutral-400 dark:text-neutral-600 pt-4'>
          Prefer the old dashboard?{' '}
          <Link
            href='/dashboard/classic'
            className='underline hover:text-neutral-700 dark:hover:text-neutral-300'
          >
            Open classic view
          </Link>
        </div>
      </div>
    </ContentLayout>
  );
}
