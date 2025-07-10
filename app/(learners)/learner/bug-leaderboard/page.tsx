'use client';

import { useState, useEffect } from 'react';
import { useBugLeaderboard } from '@/hooks/bug-reports/use-bug-reports';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Trophy,
  Medal,
  Award,
  Loader2,
  Crown,
  Star,
  TrendingUp,
  Users,
  RefreshCw
} from 'lucide-react';
import ConfettiEffect from '@/components/magic-ui/confetti';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/providers/auth-provider';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';

export default function LearnerBugLeaderboardPage() {
  const [activeTab, setActiveTab] = useState<'overall' | 'week' | 'month'>(
    'overall'
  );
  const [showConfetti, setShowConfetti] = useState(false);
  const { user } = useAuth();

  const {
    data: overallData,
    isLoading: overallLoading,
    error: overallError,
    isFetching: overallFetching,
    refetch: refetchOverall
  } = useBugLeaderboard('overall');

  const {
    data: weeklyData,
    isLoading: weekLoading,
    refetch: refetchWeek
  } = useBugLeaderboard('week');

  const {
    data: monthlyData,
    isLoading: monthLoading,
    refetch: refetchMonth
  } = useBugLeaderboard('month');

  useEffect(() => {
    if (overallData && overallData.length > 0) {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [overallData]);

  const getLeaderboardData = () => {
    switch (activeTab) {
      case 'week':
        return weeklyData || [];
      case 'month':
        return monthlyData || [];
      default:
        return overallData || [];
    }
  };

  const isLoading =
    activeTab === 'week'
      ? weekLoading
      : activeTab === 'month'
      ? monthLoading
      : overallLoading;

  const handleRefresh = () => {
    if (activeTab === 'week') refetchWeek();
    else if (activeTab === 'month') refetchMonth();
    else refetchOverall();
  };

  const leaderboard = getLeaderboardData();
  const topThree = leaderboard.slice(0, 3);
  const restOfLeaderboard = leaderboard.slice(3);

  const rank2 = topThree.length > 1 ? topThree[1] : null;
  const rank1 = topThree.length > 0 ? topThree[0] : null;
  const rank3 = topThree.length > 2 ? topThree[2] : null;

  // Check if current user is in the leaderboard
  const currentUserInLeaderboard = user
    ? leaderboard.find((u) => u.user_id === user?.id)
    : null;
  const currentUserRank =
    currentUserInLeaderboard && user
      ? leaderboard.findIndex((u) => u.user_id === user?.id) + 1
      : null;

  return (
    <div className='min-h-screen bg-gray-50 dark:bg-gray-950'>
      {showConfetti && <ConfettiEffect />}

      <div className='p-4 pb-20'>
        {/* Header */}
        <div className='mb-6'>
          <div className='flex items-center justify-between mb-2'>
            <h1 className='text-2xl font-bold flex items-center gap-2'>
              <Trophy className='w-6 h-6 text-yellow-500' />
              Leaderboard
            </h1>
            <Button
              variant='ghost'
              size='icon'
              onClick={handleRefresh}
              disabled={overallFetching || weekLoading || monthLoading}
            >
              {overallFetching || weekLoading || monthLoading ? (
                <Loader2 className='w-4 h-4 animate-spin' />
              ) : (
                <RefreshCw className='w-4 h-4' />
              )}
            </Button>
          </div>
          <p className='text-sm text-muted-foreground'>
            Top bug hunters in the community
          </p>
        </div>

        {/* Period Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className='grid grid-cols-3 w-full mb-6'>
            <TabsTrigger value='overall' className='text-xs'>
              All Time
            </TabsTrigger>
            <TabsTrigger value='week' className='text-xs'>
              This Week
            </TabsTrigger>
            <TabsTrigger value='month' className='text-xs'>
              This Month
            </TabsTrigger>
          </TabsList>

          {isLoading ? (
            <div className='flex items-center justify-center py-12'>
              <Loader2 className='w-8 h-8 animate-spin text-primary' />
            </div>
          ) : overallError ? (
            <Card className='border-red-200'>
              <CardContent className='p-6 text-center'>
                <p className='text-sm text-red-600'>
                  Error loading leaderboard
                </p>
              </CardContent>
            </Card>
          ) : leaderboard.length === 0 ? (
            <Card>
              <CardContent className='p-8 text-center'>
                <Trophy className='w-12 h-12 text-muted-foreground mx-auto mb-3' />
                <p className='text-sm font-medium'>No data yet</p>
                <p className='text-xs text-muted-foreground mt-1'>
                  Be the first to claim the top spot!
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className='space-y-6'>
              {/* Top 3 Podium - Mobile Optimized */}
              {topThree.length > 0 && (
                <Card className='bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950 dark:to-yellow-950 border-amber-200'>
                  <CardContent className='p-6'>
                    <div className='flex justify-center items-end gap-4'>
                      {/* Rank 2 */}
                      {rank2 && (
                        <div className='flex flex-col items-center flex-1 max-w-[100px]'>
                          <div className='relative'>
                            <Avatar className='w-14 h-14 border-2 border-gray-300'>
                              <AvatarImage src={rank2.avatar_url ?? ''} />
                              <AvatarFallback className='text-sm bg-gray-200'>
                                {rank2.user_name?.charAt(0) ?? 'U'}
                              </AvatarFallback>
                            </Avatar>
                            <div className='absolute -bottom-2 left-1/2 -translate-x-1/2 w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center'>
                              <span className='text-xs font-bold text-gray-700'>
                                2
                              </span>
                            </div>
                          </div>
                          <h3 className='font-medium mt-3 text-xs truncate w-full text-center'>
                            {rank2.user_name ?? 'Anonymous'}
                          </h3>
                          <p className='text-xs text-muted-foreground'>
                            {rank2.total_bugs_count} bugs
                          </p>
                        </div>
                      )}

                      {/* Rank 1 */}
                      {rank1 && (
                        <div className='flex flex-col items-center flex-1 max-w-[120px]'>
                          <Crown className='w-6 h-6 text-yellow-500 mb-1' />
                          <div className='relative'>
                            <Avatar className='w-16 h-16 border-3 border-yellow-400 ring-2 ring-yellow-200'>
                              <AvatarImage src={rank1.avatar_url ?? ''} />
                              <AvatarFallback className='text-lg bg-gradient-to-br from-yellow-200 to-amber-200'>
                                {rank1.user_name?.charAt(0) ?? 'U'}
                              </AvatarFallback>
                            </Avatar>
                            <div className='absolute -bottom-2 left-1/2 -translate-x-1/2 w-7 h-7 bg-gradient-to-br from-yellow-400 to-amber-500 rounded-full flex items-center justify-center shadow-lg'>
                              <span className='text-sm font-bold text-white'>
                                1
                              </span>
                            </div>
                          </div>
                          <h3 className='font-bold mt-3 text-sm truncate w-full text-center'>
                            {rank1.user_name ?? 'Anonymous'}
                          </h3>
                          <p className='text-xs text-muted-foreground font-medium'>
                            {rank1.total_bugs_count} bugs
                          </p>
                        </div>
                      )}

                      {/* Rank 3 */}
                      {rank3 && (
                        <div className='flex flex-col items-center flex-1 max-w-[100px]'>
                          <div className='relative'>
                            <Avatar className='w-14 h-14 border-2 border-amber-600'>
                              <AvatarImage src={rank3.avatar_url ?? ''} />
                              <AvatarFallback className='text-sm bg-amber-100'>
                                {rank3.user_name?.charAt(0) ?? 'U'}
                              </AvatarFallback>
                            </Avatar>
                            <div className='absolute -bottom-2 left-1/2 -translate-x-1/2 w-6 h-6 bg-amber-600 rounded-full flex items-center justify-center'>
                              <span className='text-xs font-bold text-white'>
                                3
                              </span>
                            </div>
                          </div>
                          <h3 className='font-medium mt-3 text-xs truncate w-full text-center'>
                            {rank3.user_name ?? 'Anonymous'}
                          </h3>
                          <p className='text-xs text-muted-foreground'>
                            {rank3.total_bugs_count} bugs
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Rest of Leaderboard - Mobile List */}
              {restOfLeaderboard.length > 0 && (
                <div className='space-y-3'>
                  <h3 className='text-sm font-medium flex items-center gap-2 px-1'>
                    <Users className='w-4 h-4' />
                    All Rankings
                  </h3>

                  {restOfLeaderboard.map((user, index) => {
                    const rank = index + 4;
                    const resolvedPercentage =
                      user.total_bugs_count > 0
                        ? Math.round(
                            (user.resolved_bugs_count / user.total_bugs_count) *
                              100
                          )
                        : 0;

                    return (
                      <Card key={user.user_id} className='overflow-hidden'>
                        <CardContent className='p-4'>
                          <div className='flex items-center gap-3'>
                            {/* Rank Badge */}
                            <div
                              className={`
                              w-10 h-10 rounded-lg flex items-center justify-center font-bold
                              ${
                                rank <= 10
                                  ? 'bg-gradient-to-br from-amber-100 to-orange-100 text-amber-700'
                                  : 'bg-gray-100 text-gray-600'
                              }
                            `}
                            >
                              {rank}
                            </div>

                            {/* User Info */}
                            <div className='flex-1'>
                              <div className='flex items-center gap-2'>
                                <Avatar className='w-8 h-8'>
                                  <AvatarImage src={user.avatar_url ?? ''} />
                                  <AvatarFallback className='text-xs'>
                                    {user.user_name?.charAt(0) ?? 'U'}
                                  </AvatarFallback>
                                </Avatar>
                                <div className='flex-1'>
                                  <p className='font-medium text-sm truncate'>
                                    {user.user_name ?? 'Anonymous'}
                                  </p>
                                  <div className='flex items-center gap-3 text-xs text-muted-foreground'>
                                    <span>{user.total_bugs_count} reports</span>
                                    <span>•</span>
                                    <span className='text-green-600'>
                                      {user.resolved_bugs_count} fixed
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Progress Bar */}
                              <div className='mt-2'>
                                <div className='flex items-center justify-between text-xs mb-1'>
                                  <span className='text-muted-foreground'>
                                    Success Rate
                                  </span>
                                  <span className='font-medium'>
                                    {resolvedPercentage}%
                                  </span>
                                </div>
                                <Progress
                                  value={resolvedPercentage}
                                  className='h-1.5'
                                />
                              </div>
                            </div>

                            {/* Special Badges */}
                            {rank <= 5 && (
                              <Badge
                                variant='outline'
                                className='bg-amber-50 border-amber-300'
                              >
                                <Star className='w-3 h-3 mr-1' />
                                Top 5
                              </Badge>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

              {/* Show total participants count */}
              {leaderboard.length > 0 && (
                <div className='text-center py-4'>
                  <p className='text-sm text-muted-foreground'>
                    Showing {leaderboard.length}{' '}
                    {leaderboard.length === 1 ? 'participant' : 'participants'}
                  </p>
                </div>
              )}

              {/* Current User Section - if not in leaderboard */}
              {user && !currentUserInLeaderboard && (
                <>
                  <Separator className='my-4' />
                  <Card className='border-dashed border-2'>
                    <CardHeader className='pb-3'>
                      <CardTitle className='text-sm'>Your Position</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className='flex items-center gap-3'>
                        <div className='w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center'>
                          <span className='text-sm text-gray-600'>—</span>
                        </div>
                        <div className='flex-1'>
                          <div className='flex items-center gap-2'>
                            <Avatar className='w-8 h-8'>
                              <AvatarImage src={user.avatar_url ?? ''} />
                              <AvatarFallback className='text-xs'>
                                {user.full_name?.charAt(0) ?? 'U'}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className='font-medium text-sm'>
                                {user.full_name ?? 'You'}
                              </p>
                              <p className='text-xs text-muted-foreground'>
                                No bugs reported yet
                              </p>
                            </div>
                          </div>
                        </div>
                        <Button size='sm' variant='outline' asChild>
                          <Link href='/learner/bug-reports'>
                            Start Reporting
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}

              {/* Highlight current user if they're in the leaderboard */}
              {currentUserInLeaderboard &&
                currentUserRank &&
                currentUserRank > 3 && (
                  <div className='text-center'>
                    <Badge
                      variant='outline'
                      className='bg-blue-50 border-blue-300'
                    >
                      <Star className='w-3 h-3 mr-1' />
                      You&apos;re ranked #{currentUserRank}
                    </Badge>
                  </div>
                )}
            </div>
          )}
        </Tabs>
      </div>
    </div>
  );
}
