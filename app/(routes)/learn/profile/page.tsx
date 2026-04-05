'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  useLearnerReputation,
  useLearnerBadges,
  useLeaderboard,
} from '@/hooks/pde/use-pde-phase2';
import {
  useLearnerQuestEnrollments,
  useLearnerCapabilities,
} from '@/hooks/pde/use-pde';
import { useAuth } from '@/hooks/use-auth';
import { BeatLoader } from 'react-spinners';
import Link from 'next/link';
import {
  Trophy,
  Star,
  Flame,
  Target,
  Award,
  TrendingUp,
  Users,
  Zap,
  Shield,
  Crown,
  Medal,
  Clock,
  ExternalLink,
  CheckCircle2,
  Lock,
  Loader2,
  Hammer,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, format } from 'date-fns';
import type { ReputationLevel, BadgeCategory, PDEBadge, PDELearnerBadge } from '@/types/pde';

// ============================================
// Constants
// ============================================

const LEVEL_CONFIG: Record<ReputationLevel, { label: string; color: string; icon: typeof Star; minPoints: number; maxPoints: number }> = {
  apprentice: { label: 'Apprentice', color: 'text-slate-500', icon: Star, minPoints: 0, maxPoints: 99 },
  practitioner: { label: 'Practitioner', color: 'text-blue-500', icon: Shield, minPoints: 100, maxPoints: 499 },
  expert: { label: 'Expert', color: 'text-purple-500', icon: Award, minPoints: 500, maxPoints: 1499 },
  principal: { label: 'Principal', color: 'text-amber-500', icon: Crown, minPoints: 1500, maxPoints: 4999 },
  mentor: { label: 'Mentor', color: 'text-emerald-500', icon: Medal, minPoints: 5000, maxPoints: 99999 },
};

const LEVEL_ORDER: ReputationLevel[] = ['apprentice', 'practitioner', 'expert', 'principal', 'mentor'];

const BADGE_CATEGORY_CONFIG: Record<BadgeCategory, { label: string; color: string }> = {
  capability: { label: 'Capability', color: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300' },
  quest: { label: 'Quest', color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' },
  social: { label: 'Social', color: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300' },
  streak: { label: 'Streak', color: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300' },
  special: { label: 'Special', color: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
};

// ============================================
// Helper Components
// ============================================

function StatCard({ icon: Icon, label, value, subtext }: {
  icon: typeof Trophy;
  label: string;
  value: string | number;
  subtext?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
            {subtext && <p className="text-[10px] text-muted-foreground mt-0.5">{subtext}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BadgeCard({ badge, earned }: { badge: PDEBadge; earned: PDELearnerBadge | null }) {
  const catConfig = badge.category ? BADGE_CATEGORY_CONFIG[badge.category] : null;

  return (
    <div
      className={cn(
        'flex flex-col items-center text-center p-3 rounded-lg border transition-all',
        earned ? 'bg-card' : 'bg-muted/30 opacity-50',
      )}
    >
      <div className={cn(
        'w-12 h-12 rounded-full flex items-center justify-center text-2xl mb-2',
        earned ? 'bg-amber-100 dark:bg-amber-950/30' : 'bg-muted',
      )}>
        {badge.icon_url ? (
          <span className="text-xl">{badge.icon_url}</span>
        ) : (
          <Award className={cn('h-6 w-6', earned ? 'text-amber-600' : 'text-muted-foreground')} />
        )}
      </div>
      <p className="text-xs font-medium leading-tight">{badge.name}</p>
      {catConfig && (
        <Badge variant="outline" className={cn('text-[10px] mt-1', catConfig.color)}>
          {catConfig.label}
        </Badge>
      )}
      {earned ? (
        <p className="text-[10px] text-muted-foreground mt-1">
          {format(new Date(earned.earned_at), 'MMM d, yyyy')}
        </p>
      ) : (
        <p className="text-[10px] text-muted-foreground mt-1">Not yet earned</p>
      )}
    </div>
  );
}

// ============================================
// My Quests Section
// ============================================

function MyQuestsSection({ learnerId }: { learnerId: string | undefined }) {
  const { data: enrollments = [], isLoading } = useLearnerQuestEnrollments(learnerId);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Target className="h-5 w-5" />
            My Quests
          </CardTitle>
          <Link href="/learn/quests" className="text-xs text-primary hover:underline">
            Browse Quest Board
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4"><BeatLoader color="#00e902" /></div>
        ) : enrollments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No active quests. Visit the Quest Board to choose a problem to solve.
          </p>
        ) : (
          <div className="space-y-2">
            {enrollments.slice(0, 5).map((e: { id: string; quest_id: string; status: string; quest?: { title?: string; difficulty?: string } }) => (
              <Link
                key={e.id}
                href={`/learn/build/${e.quest_id}`}
                className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors"
              >
                <Hammer className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {e.quest?.title || `Quest ${e.quest_id.slice(0, 8)}`}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs shrink-0">
                  {e.status || 'enrolled'}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// My Capabilities Summary
// ============================================

function MyCapabilitiesSection({ learnerId }: { learnerId: string | undefined }) {
  const { data: caps = [], isLoading } = useLearnerCapabilities(learnerId);

  const demonstrated = caps.filter((c: { status: string }) => c.status === 'demonstrated' || c.status === 'verified').length;
  const inProgress = caps.filter((c: { status: string }) => c.status === 'in_progress').length;
  const locked = caps.filter((c: { status: string }) => c.status === 'locked' || c.status === 'not_started').length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Target className="h-5 w-5" />
            My Capabilities
          </CardTitle>
          <Link href="/learn/capabilities" className="text-xs text-primary hover:underline">
            View Capability Tree
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4"><BeatLoader color="#00e902" /></div>
        ) : caps.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Start a quest to begin developing capabilities.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20">
              <CheckCircle2 className="h-5 w-5 mx-auto text-green-600 mb-1" />
              <p className="text-xl font-bold">{demonstrated}</p>
              <p className="text-xs text-muted-foreground">Demonstrated</p>
            </div>
            <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/20">
              <Loader2 className="h-5 w-5 mx-auto text-yellow-600 mb-1" />
              <p className="text-xl font-bold">{inProgress}</p>
              <p className="text-xs text-muted-foreground">In Progress</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <Lock className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <p className="text-xl font-bold">{locked}</p>
              <p className="text-xs text-muted-foreground">Locked</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// Main Page
// ============================================

export default function ProfilePage() {
  const { profile: user } = useAuth();
  const learnerId = user?.id;

  const { data: reputation, isLoading: loadingRep } = useLearnerReputation(learnerId);
  const { data: badgesData, isLoading: loadingBadges } = useLearnerBadges(learnerId);
  const { data: leaderboard } = useLeaderboard();

  const level = reputation?.level || 'apprentice';
  const levelConfig = LEVEL_CONFIG[level];
  const LevelIcon = levelConfig.icon;

  // Progress to next level
  const currentLevelIdx = LEVEL_ORDER.indexOf(level);
  const nextLevel = currentLevelIdx < LEVEL_ORDER.length - 1 ? LEVEL_ORDER[currentLevelIdx + 1] : null;
  const nextLevelConfig = nextLevel ? LEVEL_CONFIG[nextLevel] : null;
  const progressToNext = nextLevelConfig
    ? Math.min(100, Math.round(((reputation?.total_points || 0) - levelConfig.minPoints) / (nextLevelConfig.minPoints - levelConfig.minPoints) * 100))
    : 100;

  // Find learner's leaderboard position
  const myRank = leaderboard?.findIndex((e: { learner_id: string }) => e.learner_id === learnerId);
  const myPosition = myRank !== undefined && myRank >= 0 ? myRank + 1 : null;

  // Separate earned vs unearned badges
  const allBadges = badgesData?.allBadges || [];
  const earnedBadges = badgesData?.earnedBadges || [];
  const earnedMap = new Map<string, PDELearnerBadge>(
    earnedBadges.map((eb: PDELearnerBadge) => [eb.badge_id, eb] as [string, PDELearnerBadge])
  );

  if (loadingRep) {
    return (
      <ContentLayout title="My Profile">
        <div className="flex justify-center py-12">
          <BeatLoader color="#00e902" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="My Profile">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learn', href: '/learn/quests' },
          { label: 'Profile' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Reputation Card */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
              {/* Avatar + Level */}
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="text-xl bg-primary/10 text-primary">
                    {(user?.full_name || 'U').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h2 className="text-xl font-bold">{user?.full_name || 'Learner'}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <LevelIcon className={cn('h-5 w-5', levelConfig.color)} />
                    <span className={cn('font-medium', levelConfig.color)}>{levelConfig.label}</span>
                  </div>
                </div>
              </div>

              {/* Points + Progress */}
              <div className="flex-1 w-full sm:w-auto">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold">{reputation?.total_points || 0}</span>
                  <span className="text-sm text-muted-foreground">points</span>
                </div>
                {nextLevelConfig && (
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{levelConfig.label}</span>
                      <span>{nextLevelConfig.label} ({nextLevelConfig.minPoints} pts)</span>
                    </div>
                    <Progress value={progressToNext} className="h-2" />
                  </div>
                )}
              </div>
            </div>

            {/* Point Breakdown */}
            <Separator className="my-4" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="text-center p-2 bg-muted/50 rounded-md">
                <p className="text-lg font-semibold">{reputation?.quest_points || 0}</p>
                <p className="text-xs text-muted-foreground">Quest</p>
              </div>
              <div className="text-center p-2 bg-muted/50 rounded-md">
                <p className="text-lg font-semibold">{reputation?.capability_points || 0}</p>
                <p className="text-xs text-muted-foreground">Capability</p>
              </div>
              <div className="text-center p-2 bg-muted/50 rounded-md">
                <p className="text-lg font-semibold">{reputation?.social_points || 0}</p>
                <p className="text-xs text-muted-foreground">Social</p>
              </div>
              <div className="text-center p-2 bg-muted/50 rounded-md">
                <p className="text-lg font-semibold">{reputation?.consistency_points || 0}</p>
                <p className="text-xs text-muted-foreground">Consistency</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={Target} label="Quests Completed" value={reputation?.quests_completed || 0} />
          <StatCard icon={Zap} label="Capabilities" value={reputation?.capabilities_demonstrated || 0} />
          <StatCard icon={Users} label="Peer Reviews" value={reputation?.peer_reviews_given || 0} />
          <StatCard
            icon={Flame}
            label="Current Streak"
            value={`${reputation?.current_streak || 0}d`}
            subtext={`Longest: ${reputation?.longest_streak || 0}d`}
          />
        </div>

        {/* Badge Grid */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Award className="h-5 w-5" />
              Badges ({earnedBadges.length} / {allBadges.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingBadges ? (
              <div className="flex justify-center py-8">
                <BeatLoader color="#00e902" />
              </div>
            ) : allBadges.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No badges defined yet</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {allBadges.map((badge: PDEBadge) => (
                  <BadgeCard
                    key={badge.id}
                    badge={badge}
                    earned={(earnedMap.get(badge.id) as PDELearnerBadge | undefined) ?? null}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Agency Index + Portfolio Link */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Zap className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Agency Index</p>
                  <p className="text-2xl font-bold">{(reputation as Record<string, unknown>)?.agency_index as number ?? '--'}</p>
                </div>
              </div>
              <Progress value={((reputation as Record<string, unknown>)?.agency_index as number) ?? 0} className="h-1.5 mt-2" />
              <p className="text-[10px] text-muted-foreground mt-1">
                How independently you direct AI tools as a Principal
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex flex-col justify-center h-full">
              <p className="text-sm font-medium mb-2">Public Portfolio</p>
              <p className="text-xs text-muted-foreground mb-3">
                Share your verified capabilities and quest completions with employers and peers.
              </p>
              <Link href={`/portfolio/${learnerId || ''}`}>
                <Button variant="outline" size="sm" className="w-full">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  View My Public Portfolio
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* My Quests */}
        <MyQuestsSection learnerId={learnerId} />

        {/* My Capabilities Summary */}
        <MyCapabilitiesSection learnerId={learnerId} />

        {/* Leaderboard Preview */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Trophy className="h-5 w-5" />
                Leaderboard
              </CardTitle>
              <a href="/learn/leaderboard" className="text-xs text-primary hover:underline">
                View Full Leaderboard
              </a>
            </div>
          </CardHeader>
          <CardContent>
            {!leaderboard ? (
              <div className="flex justify-center py-4">
                <BeatLoader color="#00e902" />
              </div>
            ) : (
              <div className="space-y-2">
                {leaderboard.slice(0, 10).map((entry: { learner_id: string; learner_name: string; total_points: number; level: ReputationLevel; rank: number }) => {
                  const entryLevel = LEVEL_CONFIG[entry.level];
                  const isMe = entry.learner_id === learnerId;
                  return (
                    <div
                      key={entry.learner_id}
                      className={cn(
                        'flex items-center gap-3 p-2 rounded-md',
                        isMe && 'bg-primary/5 border border-primary/20',
                        entry.rank <= 3 && 'font-medium',
                      )}
                    >
                      <span className={cn(
                        'w-8 text-center font-bold text-sm',
                        entry.rank === 1 && 'text-amber-500',
                        entry.rank === 2 && 'text-slate-400',
                        entry.rank === 3 && 'text-amber-700',
                      )}>
                        #{entry.rank}
                      </span>
                      <span className="flex-1 text-sm truncate">
                        {entry.learner_name}
                        {isMe && <span className="text-xs text-primary ml-1">(You)</span>}
                      </span>
                      <Badge variant="outline" className={cn('text-xs', entryLevel.color)}>
                        {entryLevel.label}
                      </Badge>
                      <span className="text-sm font-medium w-16 text-right">{entry.total_points} pts</span>
                    </div>
                  );
                })}

                {/* Show learner's position if not in top 10 */}
                {myPosition && myPosition > 10 && (
                  <>
                    <div className="text-center text-xs text-muted-foreground py-1">...</div>
                    <div className="flex items-center gap-3 p-2 rounded-md bg-primary/5 border border-primary/20">
                      <span className="w-8 text-center font-bold text-sm">#{myPosition}</span>
                      <span className="flex-1 text-sm truncate">
                        {user?.full_name} <span className="text-xs text-primary ml-1">(You)</span>
                      </span>
                      <span className="text-sm font-medium">{reputation?.total_points || 0} pts</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
