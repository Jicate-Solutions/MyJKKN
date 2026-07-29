'use client';

import { Suspense, useState, useMemo } from 'react';
import { useTabParam } from '@/hooks/use-tab-param';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useBadges, useLearnerBadges } from '@/hooks/pde/use-pde';
import { useAuth } from '@/hooks/use-auth';
import type { PDEBadge, PDELearnerBadge } from '@/types/pde';
import { BeatLoader } from 'react-spinners';
import {
  Award,
  Lock,
  Trophy,
  Flame,
  Users,
  Target,
  Sparkles,
  Star,
  Zap,
  Calendar,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * navMeta — documents that this page is invoked via a button/link on the
 * parent listing page. Required by `scripts/assert-nav-coverage.mjs`.
 */
export const navMeta = {
  invokedFrom: '/learn/profile',
} as const;


// Badge category configuration
const CATEGORY_CONFIG: Record<string, { label: string; icon: typeof Award; color: string }> = {
  capability: { label: 'Capability', icon: Target, color: 'text-blue-600' },
  quest: { label: 'Quest', icon: Trophy, color: 'text-amber-600' },
  social: { label: 'Social', icon: Users, color: 'text-purple-600' },
  streak: { label: 'Streak', icon: Flame, color: 'text-orange-600' },
  special: { label: 'Special', icon: Sparkles, color: 'text-rose-600' },
};

// Tab values (order matches TabsList: "All" + CATEGORY_CONFIG keys). Used for
// URL-synced tabs so each category is deep-linkable / favoritable via ?tab=.
const BADGE_TABS = ['all', 'capability', 'quest', 'social', 'streak', 'special'] as const;

function BadgesPageInner() {
  const { profile: user } = useAuth();
  const learnerId = user?.id;
  const [activeCategory, setActiveCategory] = useTabParam('all', BADGE_TABS);

  const { data: allBadges, isLoading: loadingBadges } = useBadges();
  const { data: learnerBadges, isLoading: loadingLearner } = useLearnerBadges(learnerId);

  const isLoading = loadingBadges || loadingLearner;

  // Build earned badge ID set
  const earnedBadgeMap = useMemo(() => {
    const map = new Map<string, PDELearnerBadge>();
    (learnerBadges || []).forEach((lb: PDELearnerBadge) => {
      map.set(lb.badge_id, lb);
    });
    return map;
  }, [learnerBadges]);

  // Filter badges by category
  const filteredBadges = useMemo(() => {
    const badges: PDEBadge[] = allBadges || [];
    if (activeCategory === 'all') return badges;
    return badges.filter((b) => b.category === activeCategory);
  }, [allBadges, activeCategory]);

  const earnedCount = learnerBadges?.length || 0;
  const totalCount = allBadges?.length || 0;
  const progressPercent = totalCount > 0 ? Math.round((earnedCount / totalCount) * 100) : 0;

  return (
    <ContentLayout title="My Badges">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learn', href: '/learn/quests' },
          { label: 'Profile', href: '/learn/profile' },
          { label: 'Badges' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header + Progress */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#0b6d41' }}>
              Badge Collection
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Earn badges by completing capabilities, quests, and maintaining streaks
            </p>
          </div>
          <Card className="bg-[#fbfbee]/30 dark:bg-card w-full sm:w-64">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#ffde59]/20 flex items-center justify-center">
                  <Award className="h-5 w-5 text-[#0b6d41]" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {earnedCount} / {totalCount} Earned
                  </p>
                  <Progress value={progressPercent} className="h-1.5 mt-1" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Category Tabs */}
        <Tabs value={activeCategory} onValueChange={setActiveCategory}>
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="all" className="text-xs">
              <Star className="h-3.5 w-3.5 mr-1" />
              All
            </TabsTrigger>
            {Object.entries(CATEGORY_CONFIG).map(([key, config]) => {
              const Icon = config.icon;
              return (
                <TabsTrigger key={key} value={key} className="text-xs">
                  <Icon className="h-3.5 w-3.5 mr-1" />
                  {config.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value={activeCategory} className="mt-4">
            {isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {Array.from({ length: 10 }).map((_, i) => (
                  <Card key={i} className="p-4">
                    <div className="flex flex-col items-center space-y-2">
                      <Skeleton className="h-16 w-16 rounded-full" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </Card>
                ))}
              </div>
            ) : filteredBadges.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Award className="h-12 w-12 text-muted-foreground/40 mb-4" />
                <h3 className="text-lg font-medium mb-1">No badges in this category</h3>
                <p className="text-sm text-muted-foreground">
                  Badges will be added as the PDE system grows.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {filteredBadges.map((badge) => {
                  const earned = earnedBadgeMap.get(badge.id);
                  const isEarned = !!earned;
                  const catConfig = badge.category ? CATEGORY_CONFIG[badge.category] : undefined;

                  return (
                    <Card
                      key={badge.id}
                      className={cn(
                        'p-4 transition-all hover:shadow-md',
                        isEarned
                          ? 'bg-[#fbfbee]/50 dark:bg-card border-[#0b6d41]/20'
                          : 'bg-muted/30 opacity-60'
                      )}
                    >
                      <div className="flex flex-col items-center text-center space-y-2">
                        {/* Badge Icon */}
                        <div
                          className={cn(
                            'w-16 h-16 rounded-full flex items-center justify-center',
                            isEarned
                              ? 'bg-[#ffde59]/20'
                              : 'bg-muted'
                          )}
                        >
                          {isEarned ? (
                            <Award className={cn('h-8 w-8', catConfig?.color || 'text-[#0b6d41]')} />
                          ) : (
                            <Lock className="h-8 w-8 text-muted-foreground/40" />
                          )}
                        </div>

                        {/* Badge Name */}
                        <p className={cn(
                          'text-sm font-medium leading-tight',
                          !isEarned && 'text-muted-foreground'
                        )}>
                          {badge.name}
                        </p>

                        {/* Earned date or criteria */}
                        {isEarned && earned?.earned_at ? (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(earned.earned_at).toLocaleDateString()}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {badge.description || 'Complete requirements to earn'}
                          </p>
                        )}

                        {/* Category badge */}
                        {catConfig && (
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {catConfig.label}
                          </Badge>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}

export default function BadgesPage() {
  // Suspense boundary required: useTabParam() reads useSearchParams().
  return (
    <Suspense fallback={null}>
      <BadgesPageInner />
    </Suspense>
  );
}
