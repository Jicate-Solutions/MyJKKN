'use client';

/**
 * health/dashboard/page.tsx
 * JKKN Health — Student Dashboard
 *
 * The first screen 4,785 students see. Mobile-first layout.
 * Wrapped in HealthConsentProvider — non-consented users see the
 * consent gate before any health data is rendered.
 *
 * Sections:
 *  1. Time-based greeting
 *  2. Stats row — steps (circular), water (8-glass), mood streak
 *  3. Quick mood check-in CTA (if not checked in today)
 *  4. Health profile summary — blood group, BMI, emergency contact
 *  5. Leaderboard position card
 *  6. Upcoming health camps (empty state placeholder)
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Heart,
  Droplets,
  Footprints,
  Trophy,
  Activity,
  Moon,
  Brain,
  AlertCircle,
  Calendar,
  Phone,
  ChevronRight,
  Flame,
  Smile,
  CheckCircle2,
  Star,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useHealthDashboard } from '@/hooks/health/use-health';
import { HealthConsentProvider } from '../_components/consent-gate';
import {
  MOOD_EMOJIS,
  MOOD_LABELS,
  MOOD_COLORS,
  BMI_CATEGORIES,
  type MoodScore,
} from '@/types/health';

// ============================================================================
// Helpers
// ============================================================================

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function getFirstName(fullName: string | null | undefined): string {
  if (!fullName) return 'there';
  return fullName.split(' ')[0];
}

function stepProgressPercent(steps: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.min(100, Math.round((steps / goal) * 100));
}

function bmiCategoryInfo(category: string | null) {
  if (!category) return null;
  return BMI_CATEGORIES[category as keyof typeof BMI_CATEGORIES] ?? null;
}

// ============================================================================
// Circular step-count progress ring
// ============================================================================

function StepRing({
  steps,
  goal,
  isLoading,
}: {
  steps: number;
  goal: number;
  isLoading: boolean;
}) {
  const pct = stepProgressPercent(steps, goal);
  // SVG circle math — r=38 gives a nice ring on 100×100 viewBox
  const r = 38;
  const circumference = 2 * Math.PI * r;
  const strokeDash = circumference - (pct / 100) * circumference;

  return (
    <Card className="flex-1 min-w-0">
      <CardContent className="flex flex-col items-center pt-5 pb-4 gap-2">
        <div className="relative flex items-center justify-center" style={{ width: 88, height: 88 }}>
          {isLoading ? (
            <Skeleton className="rounded-full" style={{ width: 88, height: 88 }} />
          ) : (
            <>
              <svg width="88" height="88" viewBox="0 0 100 100" className="-rotate-90">
                {/* Track */}
                <circle
                  cx="50" cy="50" r={r}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="8"
                  className="text-slate-100"
                />
                {/* Fill */}
                <circle
                  cx="50" cy="50" r={r}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="8"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDash}
                  strokeLinecap="round"
                  className="text-emerald-500 transition-all duration-700"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <Footprints className="h-4 w-4 text-emerald-600 mb-0.5" />
                <span className="text-sm font-bold text-slate-800 leading-none">
                  {pct}%
                </span>
              </div>
            </>
          )}
        </div>
        <div className="text-center">
          {isLoading ? (
            <Skeleton className="h-4 w-16 mx-auto" />
          ) : (
            <>
              <p className="text-base font-bold text-slate-800">
                {steps.toLocaleString()}
              </p>
              <p className="text-xs text-slate-400">of {goal.toLocaleString()} steps</p>
            </>
          )}
        </div>
        <Badge
          variant="outline"
          className="text-xs px-2 py-0 border-emerald-200 text-emerald-700 bg-emerald-50"
        >
          Steps
        </Badge>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Water tracker (8 glass icons)
// ============================================================================

function WaterTracker({
  glasses,
  goal,
  isLoading,
}: {
  glasses: number;
  goal: number;
  isLoading: boolean;
}) {
  const filled = Math.min(glasses, goal);

  return (
    <Card className="flex-1 min-w-0">
      <CardContent className="flex flex-col items-center pt-5 pb-4 gap-2">
        <div className="flex flex-wrap justify-center gap-1" style={{ width: 88 }}>
          {isLoading ? (
            <Skeleton className="h-16 w-20 rounded-lg" />
          ) : (
            Array.from({ length: goal }).map((_, i) => (
              <Droplets
                key={i}
                className={`h-5 w-5 transition-colors duration-300 ${
                  i < filled
                    ? 'text-blue-500'
                    : 'text-slate-200'
                }`}
              />
            ))
          )}
        </div>
        <div className="text-center">
          {isLoading ? (
            <Skeleton className="h-4 w-16 mx-auto" />
          ) : (
            <>
              <p className="text-base font-bold text-slate-800">
                {glasses}/{goal}
              </p>
              <p className="text-xs text-slate-400">glasses today</p>
            </>
          )}
        </div>
        <Badge
          variant="outline"
          className="text-xs px-2 py-0 border-blue-200 text-blue-700 bg-blue-50"
        >
          Water
        </Badge>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Mood streak card
// ============================================================================

function MoodStreakCard({
  streak,
  isLoading,
}: {
  streak: number;
  isLoading: boolean;
}) {
  return (
    <Card className="flex-1 min-w-0">
      <CardContent className="flex flex-col items-center pt-5 pb-4 gap-2">
        <div className="flex items-center justify-center" style={{ width: 88, height: 88 }}>
          {isLoading ? (
            <Skeleton className="rounded-full" style={{ width: 72, height: 72 }} />
          ) : (
            <div className="flex flex-col items-center justify-center rounded-full bg-amber-50 border-2 border-amber-200"
              style={{ width: 76, height: 76 }}>
              <Flame className="h-6 w-6 text-amber-500 mb-0.5" />
              <span className="text-xl font-extrabold text-amber-600 leading-none">
                {streak}
              </span>
            </div>
          )}
        </div>
        <div className="text-center">
          {isLoading ? (
            <Skeleton className="h-4 w-16 mx-auto" />
          ) : (
            <>
              <p className="text-base font-bold text-slate-800">
                {streak} day{streak !== 1 ? 's' : ''}
              </p>
              <p className="text-xs text-slate-400">mood streak</p>
            </>
          )}
        </div>
        <Badge
          variant="outline"
          className="text-xs px-2 py-0 border-amber-200 text-amber-700 bg-amber-50"
        >
          Streak
        </Badge>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Mood check-in CTA card
// ============================================================================

function MoodCheckinCTA({ todayMood }: { todayMood: MoodScore | null }) {
  if (todayMood !== null && todayMood !== undefined) {
    // Already checked in today — show a "done" state
    return (
      <Card className="border-emerald-200 bg-emerald-50">
        <CardContent className="flex items-center gap-3 py-4 px-5">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-emerald-800">
              Mood logged today
            </p>
            <p className="text-xs text-emerald-600">
              {MOOD_EMOJIS[todayMood]}&nbsp;
              <span className={MOOD_COLORS[todayMood]}>
                {MOOD_LABELS[todayMood]}
              </span>
              &nbsp;&mdash; see you tomorrow!
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-violet-200 bg-gradient-to-r from-violet-50 to-purple-50">
      <CardContent className="flex items-center justify-between gap-3 py-4 px-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 border border-violet-200">
            <Smile className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">
              How are you feeling today?
            </p>
            <p className="text-xs text-slate-500">Quick check-in — takes 10 seconds</p>
          </div>
        </div>
        <Link href="/health/checkin">
          <Button
            size="sm"
            className="bg-violet-600 hover:bg-violet-700 text-white shrink-0"
          >
            Check In
            <ChevronRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Health profile summary card
// ============================================================================

function HealthProfileCard({
  bloodGroup,
  bmi,
  bmiCategory,
  emergencyName,
  emergencyPhone,
  profileCompleted,
  isLoading,
}: {
  bloodGroup: string | null;
  bmi: number | null;
  bmiCategory: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  profileCompleted: boolean;
  isLoading: boolean;
}) {
  const bmiInfo = bmiCategoryInfo(bmiCategory);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-rose-500" />
            Health Profile
          </CardTitle>
          {!isLoading && !profileCompleted && (
            <Link href="/health/profile">
              <Badge
                variant="outline"
                className="text-xs border-amber-300 text-amber-700 bg-amber-50 cursor-pointer hover:bg-amber-100 transition-colors"
              >
                <AlertCircle className="h-3 w-3 mr-1" />
                Incomplete
              </Badge>
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
          </div>
        ) : (
          <>
            {/* Blood Group + BMI row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-rose-50 border border-rose-100 p-3 text-center">
                <Heart className="h-4 w-4 text-rose-500 mx-auto mb-1" />
                <p className="text-lg font-bold text-slate-800">
                  {bloodGroup ?? '—'}
                </p>
                <p className="text-xs text-slate-400">Blood Group</p>
              </div>
              <div
                className={`rounded-xl border p-3 text-center ${
                  bmiInfo ? `${bmiInfo.bg} border-${bmiInfo.color.split('-')[1]}-100` : 'bg-slate-50 border-slate-100'
                }`}
              >
                <Brain className="h-4 w-4 text-slate-400 mx-auto mb-1" />
                <p className="text-lg font-bold text-slate-800">
                  {bmi !== null ? bmi.toFixed(1) : '—'}
                </p>
                <p className={`text-xs font-medium ${bmiInfo?.color ?? 'text-slate-400'}`}>
                  {bmiCategory ?? 'BMI'}
                </p>
              </div>
            </div>

            {/* Emergency contact */}
            {(emergencyName || emergencyPhone) ? (
              <div className="flex items-center gap-3 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                <Phone className="h-4 w-4 text-slate-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-700 truncate">
                    {emergencyName ?? 'Emergency Contact'}
                  </p>
                  {emergencyPhone && (
                    <p className="text-xs text-slate-400">{emergencyPhone}</p>
                  )}
                </div>
              </div>
            ) : (
              <Link href="/health/profile">
                <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-dashed border-amber-300 px-3 py-2.5 cursor-pointer hover:bg-amber-100 transition-colors">
                  <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                  <p className="text-xs text-amber-700">
                    Add an emergency contact — takes 30 seconds
                  </p>
                </div>
              </Link>
            )}

            {profileCompleted && (
              <Link href="/health/profile">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs text-slate-500 hover:text-slate-700 mt-1"
                >
                  View full profile
                  <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </Link>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Leaderboard position card
// ============================================================================

function LeaderboardPositionCard({
  rank,
  isLoading,
}: {
  rank: number | null;
  isLoading: boolean;
}) {
  return (
    <Card className="border-yellow-200 bg-gradient-to-br from-yellow-50 to-amber-50">
      <CardContent className="flex items-center gap-4 py-4 px-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-yellow-100 border-2 border-yellow-300">
          <Trophy className="h-6 w-6 text-yellow-600" />
        </div>
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-3 w-24" />
            </div>
          ) : rank !== null ? (
            <>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-extrabold text-amber-700">
                  #{rank}
                </span>
                {rank <= 3 && (
                  <Star className="h-4 w-4 text-yellow-500 fill-yellow-400" />
                )}
              </div>
              <p className="text-xs text-amber-600">
                Your leaderboard rank this week
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-amber-800">
                No rank yet
              </p>
              <p className="text-xs text-amber-600">
                Log mood or steps to appear on the board
              </p>
            </>
          )}
        </div>
        <Link href="/health/leaderboard">
          <Button
            variant="ghost"
            size="sm"
            className="text-amber-700 hover:text-amber-800 hover:bg-yellow-100 shrink-0"
          >
            View
            <ChevronRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Upcoming health camps placeholder
// ============================================================================

function HealthCampsCard() {
  return (
    <Card className="border-dashed border-teal-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-slate-600">
          <Calendar className="h-4 w-4 text-teal-500" />
          Upcoming Health Camps
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center py-4 text-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 border border-teal-100">
            <Moon className="h-6 w-6 text-teal-400" />
          </div>
          <p className="text-sm font-medium text-slate-500">
            No camps scheduled yet
          </p>
          <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
            Health camps, dental checkups, and eye screenings will appear here
            when your institution schedules them.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Skeleton set for initial page load
// ============================================================================

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div className="space-y-2 pt-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Stats row */}
      <div className="flex gap-3">
        <Skeleton className="flex-1 h-40 rounded-xl" />
        <Skeleton className="flex-1 h-40 rounded-xl" />
        <Skeleton className="flex-1 h-40 rounded-xl" />
      </div>

      {/* CTA */}
      <Skeleton className="h-16 w-full rounded-xl" />

      {/* Profile card */}
      <Skeleton className="h-44 w-full rounded-xl" />

      {/* Leaderboard */}
      <Skeleton className="h-20 w-full rounded-xl" />

      {/* Camps */}
      <Skeleton className="h-36 w-full rounded-xl" />
    </div>
  );
}

// ============================================================================
// Main page — inner (data-consuming) component
// ============================================================================

function HealthDashboardInner() {
  const { profile } = useAuth();

  const learnerId = profile?.learner_id ?? undefined;

  const { data, isLoading } = useHealthDashboard(learnerId, profile?.institution_id ?? undefined);

  const greeting = useMemo(() => getGreeting(), []);
  const firstName = getFirstName(profile?.full_name);

  // Extract commonly used values
  const todayLog = data?.todayLog ?? null;
  const healthProfile = data?.profile ?? null;
  const moodStreak =
    data?.streaks.find((s) => s.streak_type === 'mood')?.current_streak ?? 0;

  const todayMood =
    todayLog?.mood !== null && todayLog?.mood !== undefined
      ? (todayLog.mood as MoodScore)
      : null;

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-5">

      {/* ── 1. Greeting ── */}
      <div className="pt-2">
        <h1 className="text-2xl font-bold text-slate-800 leading-tight">
          {greeting},{' '}
          <span className="text-emerald-600">{firstName}</span> 👋
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {new Date().toLocaleDateString('en-IN', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
          &nbsp;&mdash;&nbsp;
          {todayMood !== null
            ? `Feeling ${MOOD_LABELS[todayMood]} today`
            : "How's your day going?"}
        </p>
      </div>

      {/* ── 2. Stats row ── */}
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory">
        <div className="snap-start min-w-0 flex-1">
          <StepRing
            steps={todayLog?.step_count ?? 0}
            goal={todayLog?.step_goal ?? 5000}
            isLoading={false}
          />
        </div>
        <div className="snap-start min-w-0 flex-1">
          <WaterTracker
            glasses={todayLog?.water_glasses ?? 0}
            goal={todayLog?.water_goal ?? 8}
            isLoading={false}
          />
        </div>
        <div className="snap-start min-w-0 flex-1">
          <MoodStreakCard streak={moodStreak} isLoading={false} />
        </div>
      </div>

      {/* ── 3. Mood check-in CTA ── */}
      <MoodCheckinCTA todayMood={todayMood} />

      {/* ── 4. Health profile summary ── */}
      <HealthProfileCard
        bloodGroup={healthProfile?.blood_group ?? null}
        bmi={healthProfile?.bmi ?? null}
        bmiCategory={healthProfile?.bmi_category ?? null}
        emergencyName={healthProfile?.emergency_contact_name ?? null}
        emergencyPhone={healthProfile?.emergency_contact_phone ?? null}
        profileCompleted={healthProfile?.profile_completed ?? false}
        isLoading={false}
      />

      {/* ── 5. Leaderboard position ── */}
      <LeaderboardPositionCard rank={data?.leaderboardRank ?? null} isLoading={false} />

      {/* ── 6. Upcoming health camps ── */}
      <HealthCampsCard />

      {/* Bottom breathing room for mobile nav bars */}
      <div className="h-4" />
    </div>
  );
}

// ============================================================================
// Exported page — wraps inner in ConsentProvider
// ============================================================================

export default function HealthDashboardPage() {
  return (
    <HealthConsentProvider>
      <ContentLayout title="My Health">
        <HealthDashboardInner />
      </ContentLayout>
    </HealthConsentProvider>
  );
}
