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
import { DashboardErrorBoundary } from '@/components/dashboard/dashboard-error-boundary';
import { getDashboardMetrics } from '@/lib/services/dashboard/dashboard-metrics-service';
import { HeroStrip } from '@/components/dashboard/hero-strip';
import { CounselorHeroStrip } from '@/components/dashboard/counselor-hero-strip';
import { getCounselorMetrics } from '@/lib/services/dashboard/counselor-metrics-service';
import { FacultyHeroStrip } from '@/components/dashboard/faculty-hero-strip';
import { getFacultyMetrics } from '@/lib/services/dashboard/faculty-metrics-service';
import { PrincipalHeroStrip } from '@/components/dashboard/principal-hero-strip';
import { getPrincipalMetrics } from '@/lib/services/dashboard/principal-metrics-service';
import { getClusterRankPublic, getClusterRankPrivate } from '@/lib/services/dashboard/cluster-rank-service';
import { getStudentMetrics } from '@/lib/services/dashboard/student-metrics-service';
import { AccountsHeroStrip } from '@/components/dashboard/accounts-hero-strip';
import { getAccountsMetrics } from '@/lib/services/dashboard/accounts-metrics-service';
import { getDashboardPersona } from '@/lib/services/dashboard/dashboard-role-service';
import { LimitedHero } from '@/components/dashboard/limited-hero';
import { StudentHeroStrip } from '@/components/dashboard/student-hero-strip';
import HodHeroStrip from '@/components/dashboard/hod-hero-strip';
import { DashboardBreadcrumb } from '@/components/dashboard/dashboard-breadcrumb';
import { DecisionQueue } from '@/components/dashboard/decision-queue';
import { LeaderboardCard } from '@/components/dashboard/leaderboard-card';
import { ThemeToggle } from '@/components/dashboard/theme-toggle';
import { PushSubscribeButton } from '@/components/dashboard/push-subscribe-button';
import { MorningBriefCard } from '@/components/dashboard/morning-brief';
import { getMorningBrief } from '@/lib/services/dashboard/morning-brief-service';
import type { QueueFilter } from '@/lib/services/dashboard/decision-queue-service';
import {
  getSlaDailyLeaderboard,
  getConversionMonthlyLeaderboard
} from '@/lib/services/dashboard/leaderboard-service';
import { StreakBadge } from '@/components/dashboard/streak-badge';
import { ActivityFeed } from '@/components/dashboard/activity-feed';
import { createClient } from '@/lib/supabase/server';
import { KeyboardShortcuts } from '@/components/dashboard/keyboard-shortcuts';

const VALID_FILTERS: QueueFilter[] = [
  'all',
  'approval',
  'escalation',
  'rescue',
  'anomaly'
];

function normalizeFilter(raw: string | string[] | undefined): QueueFilter {
  if (!raw || Array.isArray(raw)) return 'all';
  return (VALID_FILTERS as string[]).includes(raw) ? (raw as QueueFilter) : 'all';
}

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

// Week-2 addition: counselor-scoped hero strip
async function LiveCounselorHero() {
  const metrics = await getCounselorMetrics();
  return <CounselorHeroStrip metrics={metrics} />;
}

// Faculty hero strip: unmarked classes / TES / timetable / week % / cluster standing (private)
async function LiveFacultyHero() {
  const [metrics, cluster] = await Promise.all([
    getFacultyMetrics(),
    getClusterRankPrivate('faculty')
  ]);
  return <FacultyHeroStrip metrics={metrics} cluster={cluster} />;
}

// Principal hero strip: health score / staff attendance / incidents / approvals / cluster rank (5 tiles)
async function LivePrincipalHero() {
  const [metrics, cluster] = await Promise.all([
    getPrincipalMetrics(),
    getClusterRankPublic()
  ]);
  return <PrincipalHeroStrip metrics={metrics} cluster={cluster} />;
}

// Week-3 addition: student/learner-scoped hero strip (4,235 active users)
// Task 8: cluster rank fetched in parallel — private percentile only, no peer data exposed
async function LiveStudentHero() {
  const [metrics, cluster] = await Promise.all([
    getStudentMetrics(),
    getClusterRankPrivate('student')
  ]);
  return <StudentHeroStrip metrics={metrics} cluster={cluster} />;
}

// HOD hero strip: dept attendance / marking compliance / grievances / leave approvals (48 active HODs)
function LiveHodHero() {
  return <HodHeroStrip />;
}
// Accounts hero strip: collection vs plan / overdue / recon gap / refunds (11 users)
async function LiveAccountsHero() {
  const metrics = await getAccountsMetrics();
  return <AccountsHeroStrip metrics={metrics} />;
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
// Leaderboard wrappers — fetch then render
// ============================================================================
async function LiveSlaLeaderboard() {
  const result = await getSlaDailyLeaderboard(10);
  return <LeaderboardCard kind='sla_daily' result={result} />;
}

async function LiveConversionLeaderboard() {
  const result = await getConversionMonthlyLeaderboard(10);
  return <LeaderboardCard kind='conversion_monthly' result={result} />;
}

function LeaderboardSkeleton() {
  return (
    <div className='rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 p-5 animate-pulse'>
      <div className='h-4 w-1/3 bg-neutral-200 dark:bg-neutral-800 rounded' />
      <div className='mt-3 space-y-2'>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className='h-10 bg-neutral-100 dark:bg-neutral-800/50 rounded-lg'
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Decision Queue skeleton (fallback during server fetch)
// ============================================================================
function QueueSkeleton() {
  return (
    <div className='rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 p-5 animate-pulse'>
      <div className='h-4 w-1/4 bg-neutral-200 dark:bg-neutral-800 rounded' />
      <div className='mt-3 space-y-2'>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className='h-20 bg-neutral-100 dark:bg-neutral-800/50 rounded-lg'
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Live Morning Brief wrapper — fetches brief data, renders dismissible card
// ============================================================================
async function LiveMorningBrief() {
  const brief = await getMorningBrief();
  if (!brief.ok) return null; // RPC failed or user not authed — skip gracefully
  return <MorningBriefCard brief={brief} />;
}

// ============================================================================
// Institution chip row — quick drill-down to per-institution views
// ============================================================================
async function InstitutionChips() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('institutions')
    .select('id, name')
    .order('name', { ascending: true })
    .limit(12);
  const institutions = (data ?? []) as Array<{ id: string; name: string }>;
  if (institutions.length === 0) return null;
  return (
    <div className='flex items-center gap-2 overflow-x-auto pb-2 -mx-2 px-2 scroll-smooth'>
      <span className='text-[11px] uppercase tracking-wider text-neutral-500 whitespace-nowrap mr-1'>
        Drill into:
      </span>
      {institutions.map((inst) => (
        <Link
          key={inst.id}
          href={`/dashboard/i/${inst.id}`}
          className='px-3 py-1.5 text-xs rounded-full bg-white/80 dark:bg-neutral-900/80 border border-neutral-200 dark:border-neutral-800 whitespace-nowrap hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors'
        >
          {inst.name}
        </Link>
      ))}
    </div>
  );
}

// ============================================================================
// Main page (server component — fetches RPC, renders)
// ============================================================================
export default async function DashboardV2Page({
  searchParams
}: {
  searchParams: Promise<{ queue?: string }>;
}) {
  const sp = await searchParams;
  const filter = normalizeFilter(sp.queue);
  // Role-aware persona resolution (spec §5). Limited = safe default for roles without a
  // specific dashboard yet — prevents director's cross-institution aggregates from leaking to
  // faculty/hod/warden/accounts/student/parent.
  const persona = await getDashboardPersona();
  const isDirector = persona === 'director';
  const isCounselor = persona === 'counselor';
  const isFaculty = persona === 'faculty';
  const isHod = persona === 'hod';
  const isPrincipal = persona === 'principal';
  const isAccounts = persona === 'accounts';
  const isStudent = persona === 'student';
  const isLimited = persona === 'limited';

  return (
    <ContentLayout title='Dashboard'>
      <KeyboardShortcuts />
      {/* Animated glass background */}
      <div className='fixed inset-0 -z-10 overflow-hidden pointer-events-none'>
        <div className='absolute inset-0 bg-gradient-to-br from-emerald-50/40 via-white/20 to-sky-50/40 dark:from-emerald-950/30 dark:via-neutral-950/20 dark:to-sky-950/30' />
        <div className='absolute -top-1/2 -right-1/2 w-full h-full bg-gradient-to-br from-emerald-400/10 via-transparent to-sky-400/10 blur-3xl animate-blob' />
      </div>

      <div className='space-y-4 sm:space-y-5 lg:space-y-6 px-2 sm:px-3 lg:px-4 pb-10'>
        <DashboardBreadcrumb
          crumbs={[
            {
              label: isDirector ? 'JKKN — All Institutions' : 'My Dashboard',
              active: true
            }
          ]}
        />

        {/* 8am Morning Brief (spec §7.7) — dismissible per-day, safe for all personas
            (reads only user's own acked/unacked counts) */}
        <div data-dashboard-section='morning-brief'>
          <Suspense fallback={null}>
            <LiveMorningBrief />
          </Suspense>
        </div>

        {/* Hero — role-aware (§7.1 Director / §5+§8 Counselor / Faculty / Principal / Student / limited safe default) */}
        {/* Hero — role-aware (§7.1 Director / §5+§8 Counselor / Faculty / Accounts / Student / limited safe default) */}
        <Suspense fallback={<HeroSkeleton />}>
          {isDirector && <LiveHeroStrip />}
          {isCounselor && <LiveCounselorHero />}
          {isFaculty && <LiveFacultyHero />}
          {isHod && <LiveHodHero />}
          {isPrincipal && <LivePrincipalHero />}
          {isAccounts && <LiveAccountsHero />}
          {isStudent && <LiveStudentHero />}
          {isLimited && <LimitedHero />}
        </Suspense>

        {/* Streak badge — Director + Counselor only (spec §4.3) */}
        {(isDirector || isCounselor) && (
          <Suspense fallback={null}>
            <StreakBadge />
          </Suspense>
        )}

        {/* Institution quick-drill chips — DIRECTOR ONLY (cross-institution scope) */}
        {isDirector && (
          <Suspense fallback={null}>
            <InstitutionChips />
          </Suspense>
        )}

        {/* Decision Queue — safe for ALL personas (already scoped by auth.uid() in RPC).
            Hidden for students — they have no actionable queue items. */}
        {!isStudent && (
          <div data-dashboard-section='decision-queue'>
            <Suspense fallback={<QueueSkeleton />}>
              <DecisionQueue filter={filter} />
            </Suspense>
          </div>
        )}

        {/* Leaderboards ��� Director + Counselor only (social pressure across counselors).
            Hidden for students and limited roles (not competing on counselor metrics). */}
        {/* Team Activity Feed — all personas except student + limited (spec §4.4) */}
        {!isStudent && !isLimited && (
          <Suspense fallback={null}>
            <ActivityFeed />
          </Suspense>
        )}

        {(isDirector || isCounselor) && (
          <div data-dashboard-section='leaderboards' className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
            <Suspense fallback={<LeaderboardSkeleton />}>
              <LiveSlaLeaderboard />
            </Suspense>
            <Suspense fallback={<LeaderboardSkeleton />}>
              <LiveConversionLeaderboard />
            </Suspense>
          </div>
        )}

        {/* Footer: push opt-in + classic fallback link */}
        <footer className='flex flex-col sm:flex-row items-center justify-between gap-3 pt-4'>
          <PushSubscribeButton
            vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY}
          />
          <ThemeToggle />
          <div className='text-xs text-neutral-400 dark:text-neutral-600'>
            Prefer the old dashboard?{' '}
            <Link
              href='/dashboard/classic'
              className='underline hover:text-neutral-700 dark:hover:text-neutral-300'
            >
              Open classic view
            </Link>
          </div>
        </footer>
      </div>
    </ContentLayout>
  );
}
