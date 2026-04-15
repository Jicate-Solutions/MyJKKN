/**
 * Dashboard v2 — Operational Nervous System
 * Skeleton page (Day 1 — 2026-04-15). Real data wires in Day 2.
 *
 * Spec: specs/myjkkn-dashboard-v2-spec.md
 * Decisions: 40 locked across /myjkkn-module (6 rounds) + /assumption-thrash (4 rounds)
 *
 * Structure per spec §7:
 *   §7.1 Hero Strip (4 tiles) — OHS, Pipeline ₹, Attendance %, Pending Decisions
 *   §7.2 Decision Queue (approvals + escalations + rescues + anomalies)
 *   §7.3 Broadcast Rescue (Day 4)
 *   §7.4 Web Push (Day 4)
 *   §7.5 Multi-institution drill-down (Day 2)
 *   §7.6 Leaderboards (Day 4)
 *   §7.7 Morning brief card (Day 5)
 *
 * Old dashboard preserved at /dashboard/classic for 60-day grace period.
 */

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';

// ============================================================================
// Hero Strip — 4 KPI tiles (Day 1: placeholders, Day 2: real data)
// ============================================================================
type HeroTile = {
  label: string;
  value: string;
  subtitle: string;
  color: 'green' | 'amber' | 'red' | 'neutral';
  sparklineHint: string;
};

const PLACEHOLDER_TILES: HeroTile[] = [
  {
    label: 'Operational Health',
    value: '—',
    subtitle: 'OHS (Attendance + SLA + Fees + Escalations)',
    color: 'neutral',
    sparklineHint: 'wires Day 2'
  },
  {
    label: 'Pipeline Value',
    value: '—',
    subtitle: 'Σ(hot leads × fee × conversion probability)',
    color: 'neutral',
    sparklineHint: 'wires Day 2'
  },
  {
    label: 'Live Attendance',
    value: '—',
    subtitle: 'Active learners present now',
    color: 'neutral',
    sparklineHint: 'wires Day 2'
  },
  {
    label: 'Pending Decisions',
    value: '—',
    subtitle: 'Items awaiting your approval',
    color: 'neutral',
    sparklineHint: 'wires Day 3'
  }
];

const TILE_COLOR: Record<HeroTile['color'], string> = {
  green:
    'border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-100',
  amber:
    'border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-100',
  red: 'border-rose-500/30 bg-rose-50/50 dark:bg-rose-950/20 text-rose-900 dark:text-rose-100',
  neutral:
    'border-neutral-200 bg-white/80 dark:bg-neutral-900/80 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100'
};

function HeroTileCard({ tile }: { tile: HeroTile }) {
  return (
    <div
      className={`group relative rounded-2xl border ${TILE_COLOR[tile.color]} p-5 backdrop-blur-sm transition-all hover:shadow-lg hover:scale-[1.01] cursor-pointer`}
    >
      <div className='text-xs font-medium uppercase tracking-wider opacity-70'>
        {tile.label}
      </div>
      <div className='mt-3 text-4xl font-bold tabular-nums'>{tile.value}</div>
      <div className='mt-2 text-xs opacity-60'>{tile.subtitle}</div>
      <div className='mt-4 h-8 rounded bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-[10px] uppercase tracking-wide opacity-40'>
        sparkline · {tile.sparklineHint}
      </div>
    </div>
  );
}

// ============================================================================
// Decision Queue placeholder (Day 1) — real inbox Day 3
// ============================================================================
function DecisionQueuePlaceholder() {
  return (
    <div className='rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm'>
      <div className='flex items-center justify-between p-5 border-b border-neutral-200 dark:border-neutral-800'>
        <div>
          <h2 className='text-lg font-semibold'>Decision Queue</h2>
          <p className='text-xs text-neutral-500 mt-1'>
            Items awaiting your action · auto-escalates to Chief of Staff after 2h
          </p>
        </div>
        <div className='flex gap-1.5'>
          {['All', 'Approvals', 'Escalations', 'Rescues', 'Anomalies'].map(
            (chip, i) => (
              <span
                key={chip}
                className={`px-2.5 py-1 text-xs rounded-full ${i === 0 ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'}`}
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
        <div className='text-xs text-neutral-500 mt-2 max-w-md mx-auto'>
          Approvals · Escalated complaints · Cold lead rescues · Anomalies requiring
          your judgment. Each item ships with inline Approve/Reject/Delegate/Snooze
          actions. Powered by existing <code>notifications</code> +{' '}
          <code>user_notifications</code> (19,494 live rows).
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Day-1 build banner (kept during Week 1, removed at Day 5)
// ============================================================================
function BuildBanner() {
  return (
    <div className='rounded-xl border border-blue-500/30 bg-blue-50/60 dark:bg-blue-950/20 p-4'>
      <div className='flex items-start gap-3'>
        <span className='text-lg'>🏗️</span>
        <div className='flex-1 text-sm'>
          <div className='font-semibold text-blue-900 dark:text-blue-100'>
            Dashboard v2 — Day 1 skeleton
          </div>
          <div className='text-blue-800/80 dark:text-blue-200/80 mt-1 leading-relaxed'>
            Migrations applied to staging (2 new tables, 11 new columns, 2
            materialized views, trigger, RLS). Hero tiles + queue wire Days 2–3.
            Broadcast rescue + leaderboards + push Day 4. Morning brief + polish
            Day 5. Old dashboard still accessible at{' '}
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
// Main page
// ============================================================================
export default function DashboardV2Page() {
  return (
    <ContentLayout title='Dashboard'>
      {/* Animated glass background (carried from classic for visual continuity) */}
      <div className='fixed inset-0 -z-10 overflow-hidden pointer-events-none'>
        <div className='absolute inset-0 bg-gradient-to-br from-emerald-50/40 via-white/20 to-sky-50/40 dark:from-emerald-950/30 dark:via-neutral-950/20 dark:to-sky-950/30' />
        <div className='absolute -top-1/2 -right-1/2 w-full h-full bg-gradient-to-br from-emerald-400/10 via-transparent to-sky-400/10 blur-3xl animate-blob' />
      </div>

      <div className='space-y-4 sm:space-y-5 lg:space-y-6 px-2 sm:px-3 lg:px-4 pb-10'>
        <BuildBanner />

        {/* Hero Strip — 4 tiles (spec §7.1) */}
        <section aria-label='Hero KPI strip'>
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4'>
            {PLACEHOLDER_TILES.map((tile) => (
              <HeroTileCard key={tile.label} tile={tile} />
            ))}
          </div>
        </section>

        {/* Decision Queue (spec §7.2) */}
        <section aria-label='Decision queue'>
          <DecisionQueuePlaceholder />
        </section>

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
