'use client';

// Health Leaderboard page — gamification board with 3 tabs.
// Usage: /health/leaderboard
// Tabs: Mood Streaks | Hydration | Steps (coming soon)

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Trophy,
  Flame,
  Droplets,
  Footprints,
  Medal,
  TrendingUp,
  Smartphone,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useHealthLeaderboard } from '@/hooks/health/use-health';
import type { LeaderboardEntry, LeaderboardType, LeaderboardPeriod } from '@/types/health';
import { cn } from '@/lib/utils';

// ============================================================================
// Helpers
// ============================================================================

const MEDAL_CONFIG = [
  {
    rank: 1,
    icon: '🥇',
    bg: 'bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-950/30 dark:to-amber-950/30',
    border: 'border-yellow-300/60 dark:border-yellow-700/40',
    rankBg: 'bg-yellow-400 text-yellow-900',
  },
  {
    rank: 2,
    icon: '🥈',
    bg: 'bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-950/30 dark:to-gray-950/30',
    border: 'border-slate-300/60 dark:border-slate-700/40',
    rankBg: 'bg-slate-400 text-slate-900',
  },
  {
    rank: 3,
    icon: '🥉',
    bg: 'bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30',
    border: 'border-orange-300/60 dark:border-orange-700/40',
    rankBg: 'bg-orange-400 text-orange-900',
  },
];

/** Shorten "Firstname Lastname" → "Firstname L." for privacy */
function formatName(fullName: string): string {
  const parts = fullName.trim().split(' ');
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

/** Format stat value based on leaderboard type */
function formatStat(type: LeaderboardType, value: number): string {
  if (type === 'mood_streak') return `${value}d streak`;
  if (type === 'water_consistency') return `${value} days`;
  if (type === 'steps') return value.toLocaleString() + ' steps';
  return String(value);
}

// ============================================================================
// Sub-components
// ============================================================================

function PodiumCard({
  entry,
  type,
  isCurrentUser,
}: {
  entry: LeaderboardEntry;
  type: LeaderboardType;
  isCurrentUser: boolean;
}) {
  const medal = MEDAL_CONFIG[entry.rank - 1];
  if (!medal) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border px-4 py-3 transition-all',
        medal.bg,
        medal.border,
        isCurrentUser && 'ring-2 ring-primary ring-offset-2'
      )}
    >
      <span className="text-2xl leading-none" aria-label={`Rank ${entry.rank}`}>
        {medal.icon}
      </span>
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'font-semibold text-sm truncate',
            isCurrentUser && 'text-primary'
          )}
        >
          {formatName(entry.learner_name)}
          {isCurrentUser && (
            <span className="ml-1.5 text-xs font-normal text-primary/70">
              (you)
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {entry.institution_name}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="font-bold text-sm">{formatStat(type, entry.value)}</p>
        <p className="text-xs text-muted-foreground">#{entry.rank}</p>
      </div>
    </div>
  );
}

function LeaderboardRow({
  entry,
  type,
  isCurrentUser,
}: {
  entry: LeaderboardEntry;
  type: LeaderboardType;
  isCurrentUser: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
        isCurrentUser
          ? 'bg-primary/8 border border-primary/20'
          : 'hover:bg-muted/50'
      )}
    >
      {/* Rank */}
      <span
        className={cn(
          'w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold shrink-0',
          isCurrentUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground'
        )}
      >
        {entry.rank}
      </span>

      {/* Name + institution */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'text-sm font-medium truncate',
            isCurrentUser && 'text-primary font-semibold'
          )}
        >
          {formatName(entry.learner_name)}
          {isCurrentUser && (
            <span className="ml-1 text-xs font-normal text-primary/70">
              (you)
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {entry.institution_name}
        </p>
      </div>

      {/* Stat */}
      <span
        className={cn(
          'text-sm font-semibold shrink-0',
          isCurrentUser && 'text-primary'
        )}
      >
        {formatStat(type, entry.value)}
      </span>
    </div>
  );
}

function LeaderboardSkeleton() {
  return (
    <div className="space-y-2">
      {/* Podium skeletons */}
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
      <div className="mt-4 space-y-1.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  message,
  sub,
}: {
  icon: React.ElementType;
  message: string;
  sub: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
      <div className="rounded-full bg-muted p-4">
        <Icon className="h-8 w-8 text-muted-foreground/50" />
      </div>
      <p className="font-medium text-muted-foreground">{message}</p>
      <p className="text-sm text-muted-foreground/70 max-w-xs">{sub}</p>
    </div>
  );
}

// ============================================================================
// Leaderboard tab content (shared for mood + hydration tabs)
// ============================================================================

function LeaderboardTab({
  type,
  currentLearnerId,
  institutionFilter,
}: {
  type: LeaderboardType;
  currentLearnerId: string | undefined;
  institutionFilter: string | undefined;
}) {
  const { data: entries, isLoading } = useHealthLeaderboard(type, institutionFilter);

  if (isLoading) return <LeaderboardSkeleton />;

  if (!entries || entries.length === 0) {
    const icon = type === 'mood_streak' ? Flame : Droplets;
    return (
      <EmptyState
        icon={icon}
        message="No entries yet"
        sub="Be the first to log consistently and claim the top spot."
      />
    );
  }

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3, 50);

  return (
    <div className="space-y-4">
      {/* Podium — top 3 */}
      <div className="space-y-2">
        {top3.map((entry) => (
          <PodiumCard
            key={entry.learner_id}
            entry={entry}
            type={type}
            isCurrentUser={entry.learner_id === currentLearnerId}
          />
        ))}
      </div>

      {/* Rest of the list */}
      {rest.length > 0 && (
        <div className="space-y-1 pt-2 border-t">
          {rest.map((entry) => (
            <LeaderboardRow
              key={entry.learner_id}
              entry={entry}
              type={type}
              isCurrentUser={entry.learner_id === currentLearnerId}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center pt-1">
        Showing top {Math.min(50, entries.length)} participants
      </p>
    </div>
  );
}

// ============================================================================
// Stats banner — current user snapshot
// ============================================================================

function UserRankBanner({
  leaderboard,
  type,
  currentLearnerId,
}: {
  leaderboard: LeaderboardEntry[] | undefined;
  type: LeaderboardType;
  currentLearnerId: string | undefined;
}) {
  if (!leaderboard || !currentLearnerId) return null;
  const myEntry = leaderboard.find((e) => e.learner_id === currentLearnerId);
  if (!myEntry) return null;

  return (
    <div className="flex items-center gap-3 rounded-lg bg-primary/5 border border-primary/20 px-4 py-3">
      <Medal className="h-5 w-5 text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">Your rank</p>
        <p className="text-xs text-muted-foreground">
          {formatStat(type, myEntry.value)}
        </p>
      </div>
      <Badge variant="outline" className="text-primary border-primary/30 font-bold text-base px-3">
        #{myEntry.rank}
      </Badge>
    </div>
  );
}

// ============================================================================
// Coming soon — steps tab
// ============================================================================

function StepsComingSoon() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-5 text-center">
      <div className="relative">
        <div className="rounded-full bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-950/30 dark:to-emerald-950/30 p-6">
          <Footprints className="h-10 w-10 text-green-600 dark:text-green-400" />
        </div>
        <span className="absolute -top-1 -right-1 text-lg">📱</span>
      </div>

      <div className="space-y-2 max-w-sm">
        <h3 className="text-lg font-semibold">Steps Leaderboard</h3>
        <p className="text-sm text-muted-foreground">
          Coming soon with the MyJKKN native app. Your phone&apos;s pedometer
          will sync daily step counts and power this leaderboard automatically.
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-5 py-3 text-sm text-muted-foreground">
        <Smartphone className="h-4 w-4 shrink-0" />
        Available in MyJKKN App v2.0
      </div>
    </div>
  );
}

// ============================================================================
// Main page
// ============================================================================

const PERIOD_OPTIONS: { value: LeaderboardPeriod; label: string }[] = [
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'all_time', label: 'All Time' },
];

// Mock institutions list — in production this would come from useInstitutionsWithAccess
// The leaderboard filter passes institutionId to the hook; "all" passes undefined
const INSTITUTION_PLACEHOLDER = 'All Institutions';

export default function HealthLeaderboardPage() {
  const { profile } = useAuth();
  const currentLearnerId = profile?.learner_id ?? profile?.id;

  const [activeTab, setActiveTab] = useState<LeaderboardType>('mood_streak');
  const [institutionFilter, setInstitutionFilter] = useState<string>('all');
  const [period, setPeriod] = useState<LeaderboardPeriod>('week');

  // Pass institutionId to hook only when a specific one is selected
  const institutionId =
    institutionFilter && institutionFilter !== 'all' ? institutionFilter : undefined;

  // Fetch data for current tab to power the "Your Rank" banner
  const { data: currentLeaderboard } = useHealthLeaderboard(
    activeTab,
    institutionId
  );

  const tabMeta: Record<
    LeaderboardType,
    { label: string; icon: React.ElementType; description: string }
  > = {
    mood_streak: {
      label: 'Mood Streaks',
      icon: Flame,
      description: 'Ranked by current consecutive days of mood check-ins',
    },
    water_consistency: {
      label: 'Hydration',
      icon: Droplets,
      description: 'Days this week where daily water goal was met',
    },
    steps: {
      label: 'Steps',
      icon: Footprints,
      description: 'Weekly step totals from the MyJKKN native app',
    },
  };

  const currentMeta = tabMeta[activeTab];

  return (
    <ContentLayout title="Health Leaderboard">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Health', href: '/health/dashboard' },
          { label: 'Leaderboard' },
        ]}
      />

      <div className="mt-4 space-y-6 max-w-2xl">
        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: '#0b6d41' }}>
              <Trophy className="h-6 w-6" />
              Leaderboard
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Stay consistent. Climb the ranks. Build healthy habits.
            </p>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={period} onValueChange={(v) => setPeriod(v as LeaderboardPeriod)}>
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={institutionFilter} onValueChange={setInstitutionFilter}>
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue placeholder={INSTITUTION_PLACEHOLDER} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  All Institutions
                </SelectItem>
                {/* If this user belongs to an institution, show it as a filter option */}
                {profile?.institution_id && (
                  <SelectItem value={profile.institution_id} className="text-xs">
                    My Institution
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Tab navigation */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as LeaderboardType)}
        >
          <TabsList className="grid w-full grid-cols-3">
            {(Object.entries(tabMeta) as [LeaderboardType, typeof tabMeta[LeaderboardType]][]).map(
              ([key, meta]) => {
                const Icon = meta.icon;
                return (
                  <TabsTrigger key={key} value={key} className="gap-1.5 text-xs sm:text-sm">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="hidden sm:inline">{meta.label}</span>
                    <span className="sm:hidden">
                      {meta.label.split(' ')[0]}
                    </span>
                  </TabsTrigger>
                );
              }
            )}
          </TabsList>

          {/* Tab content panels */}
          {(Object.entries(tabMeta) as [LeaderboardType, typeof tabMeta[LeaderboardType]][]).map(
            ([key, meta]) => {
              const Icon = meta.icon;
              return (
                <TabsContent key={key} value={key} className="mt-4 space-y-4">
                  <Card>
                    <CardHeader className="pb-2 pt-4 px-5">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Icon className="h-4.5 w-4.5 text-primary" />
                        {meta.label}
                        <Badge variant="secondary" className="ml-auto text-xs">
                          <TrendingUp className="h-3 w-3 mr-1" />
                          Live
                        </Badge>
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {meta.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="px-5 pb-5 space-y-4">
                      {/* Your rank banner */}
                      {key !== 'steps' && (
                        <UserRankBanner
                          leaderboard={currentLeaderboard}
                          type={activeTab}
                          currentLearnerId={currentLearnerId}
                        />
                      )}

                      {/* Main content */}
                      {key === 'steps' ? (
                        <StepsComingSoon />
                      ) : (
                        <LeaderboardTab
                          type={key}
                          currentLearnerId={currentLearnerId}
                          institutionFilter={institutionId}
                        />
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              );
            }
          )}
        </Tabs>

        {/* Footer note */}
        <p className="text-xs text-muted-foreground text-center pb-4">
          Leaderboard refreshes every 60 seconds. Keep logging daily to stay on top.
        </p>
      </div>
    </ContentLayout>
  );
}
