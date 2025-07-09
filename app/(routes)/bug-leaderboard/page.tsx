'use client';

import { useBugLeaderboard } from '@/hooks/bug-reports/use-bug-reports';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ContentLayout } from '@/components/layout/content-layout';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Trophy, Medal, Award } from 'lucide-react';
import { useState, useEffect } from 'react';
import ConfettiEffect from '@/components/magic-ui/confetti';

export default function BugLeaderboardPage() {
  const {
    data: leaderboard,
    isLoading,
    error,
    isFetching
  } = useBugLeaderboard();
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (leaderboard && leaderboard.length > 0) {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 5000); // Confetti lasts for 5 seconds
      return () => clearTimeout(timer);
    }
  }, [leaderboard]);

  const topThree = leaderboard?.slice(0, 3) ?? [];
  const restOfLeaderboard = leaderboard?.slice(3) ?? [];

  const rank2 = topThree.length > 1 ? topThree[1] : null;
  const rank1 = topThree.length > 0 ? topThree[0] : null;
  const rank3 = topThree.length > 2 ? topThree[2] : null;

  return (
    <ContentLayout title='Bug Reporters Leaderboard'>
      {showConfetti && <ConfettiEffect />}
      <div className='flex items-center justify-between mb-4'>
        <p className='text-muted-foreground'>
          Top users helping improve the platform.
        </p>
        {isFetching && !isLoading && (
          <div className='flex items-center gap-2 text-sm text-muted-foreground'>
            <div className='w-2 h-2 bg-green-500 rounded-full animate-pulse'></div>
            <span>Updating...</span>
          </div>
        )}
      </div>

      {isLoading && (
        <div className='text-center p-8'>Loading leaderboard...</div>
      )}
      {error && (
        <div className='text-center p-8 text-destructive'>
          Error loading leaderboard: {error.message}
        </div>
      )}

      {!isLoading && !error && leaderboard && leaderboard.length > 0 && (
        <div className='space-y-8'>
          {/* Top 3 Podium */}
          <div className='flex justify-center items-end gap-4 pt-8'>
            {/* Rank 2 */}
            {rank2 && (
              <div className='flex flex-col items-center w-1/3'>
                <div className='relative'>
                  <Avatar className='w-16 h-16 lg:w-20 lg:h-20 border-4 border-gray-300'>
                    <AvatarImage src={rank2.avatar_url ?? ''} />
                    <AvatarFallback>
                      {rank2.user_name?.charAt(0) ?? 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className='absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 lg:w-8 lg:h-8 bg-gray-300 rounded-full flex items-center justify-center text-gray-700 font-bold'>
                    2
                  </div>
                </div>
                <h3 className='font-bold mt-4 text-center truncate text-sm lg:text-base'>
                  {rank2.user_name ?? 'Anonymous'}
                </h3>
                <p className='text-muted-foreground text-sm'>
                  {rank2.total_bugs_count} reports
                </p>
              </div>
            )}
            {/*Spacer for alignment if only #1 exists*/}
            {!rank2 && rank1 && <div className='w-1/3' />}

            {/* Rank 1 */}
            {rank1 && (
              <div className='flex flex-col items-center w-1/3'>
                <div className='relative'>
                  <Trophy className='w-8 h-8 text-yellow-400 absolute -top-6 left-1/2 -translate-x-1/2' />
                  <Avatar className='w-16 h-16 lg:w-24 lg:h-24 border-4 border-yellow-400'>
                    <AvatarImage src={rank1.avatar_url ?? ''} />
                    <AvatarFallback>
                      {rank1.user_name?.charAt(0) ?? 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className='absolute -bottom-4 left-1/2 -translate-x-1/2 w-8 h-8 lg:w-10 lg:h-10 bg-yellow-400 rounded-full flex items-center justify-center text-white font-bold text-lg'>
                    1
                  </div>
                </div>
                <h3 className='font-bold mt-6  text-center truncate text-sm lg:text-base'>
                  {rank1.user_name ?? 'Anonymous'}
                </h3>
                <p className='text-muted-foreground'>
                  {rank1.total_bugs_count} reports
                </p>
              </div>
            )}

            {/* Rank 3 */}
            {rank3 && (
              <div className='flex flex-col items-center w-1/3'>
                <div className='relative'>
                  <Avatar className='w-16 h-16 lg:w-20 lg:h-20 border-4 border-amber-600'>
                    <AvatarImage src={rank3.avatar_url ?? ''} />
                    <AvatarFallback>
                      {rank3.user_name?.charAt(0) ?? 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className='absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 lg:w-8 lg:h-8 bg-amber-600 rounded-full flex items-center justify-center text-white font-bold'>
                    3
                  </div>
                </div>
                <h3 className='font-semibold mt-4 text-center truncate text-sm lg:text-base'>
                  {rank3.user_name ?? 'Anonymous'}
                </h3>
                <p className='text-muted-foreground text-sm'>
                  {rank3.total_bugs_count} reports
                </p>
              </div>
            )}
            {/*Spacer for alignment if only #1 exists*/}
            {!rank3 && rank1 && <div className='w-1/3' />}
          </div>

          {/* Complete Rankings - Table Format */}
          {leaderboard && leaderboard.length > 0 && (
            <div className='pt-8'>
              <h3 className='text-lg font-semibold mb-4 flex items-center gap-2'>
                <Award className='w-5 h-5' />
                Complete Rankings
              </h3>
              <Card className='overflow-hidden'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className='w-16 text-center'>Rank</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead className='text-center'>Bug Reports</TableHead>
                      <TableHead className='text-center'>Resolved</TableHead>
                      <TableHead className='text-center'>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaderboard.map((user, index) => {
                      const rank = index + 1;
                      const isTopThree = rank <= 3;
                      const isTopTen = rank <= 10;
                      const resolvedBugs = user.resolved_bugs_count || 0;
                      const totalBugs = user.total_bugs_count || 0;
                      const resolvedPercentage =
                        totalBugs > 0
                          ? Math.round((resolvedBugs / totalBugs) * 100)
                          : 0;

                      return (
                        <TableRow
                          key={user.user_id}
                          className={`${
                            isTopThree
                              ? 'bg-gradient-to-r from-yellow-50 to-amber-50 border-l-4 border-l-yellow-400'
                              : isTopTen
                              ? 'bg-muted/20'
                              : ''
                          }`}
                        >
                          <TableCell className='text-center'>
                            <div className='flex items-center justify-center'>
                              {rank === 1 && (
                                <Trophy className='w-4 h-4 text-yellow-500 mr-1' />
                              )}
                              {rank === 2 && (
                                <Medal className='w-4 h-4 text-gray-400 mr-1' />
                              )}
                              {rank === 3 && (
                                <Medal className='w-4 h-4 text-amber-600 mr-1' />
                              )}
                              {rank > 3 && rank <= 10 && (
                                <Medal className='w-4 h-4 text-amber-500 mr-1' />
                              )}
                              <span
                                className={`font-bold ${
                                  isTopThree
                                    ? 'text-yellow-600'
                                    : isTopTen
                                    ? 'text-amber-600'
                                    : ''
                                }`}
                              >
                                #{rank}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className='flex items-center gap-3'>
                              <Avatar className='w-8 h-8'>
                                <AvatarImage src={user.avatar_url ?? ''} />
                                <AvatarFallback className='text-xs'>
                                  {user.user_name?.charAt(0) ?? 'U'}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div
                                  className={`font-medium ${
                                    isTopThree ? 'text-yellow-700' : ''
                                  }`}
                                >
                                  {user.user_name ?? 'Anonymous'}
                                </div>
                                {isTopThree && (
                                  <div className='text-xs text-yellow-600 font-medium'>
                                    🏆 Podium Finisher
                                  </div>
                                )}
                                {!isTopThree && isTopTen && (
                                  <div className='text-xs text-amber-600 font-medium'>
                                    Top 10 Contributor
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className='text-center'>
                            <Badge
                              variant={isTopThree ? 'default' : 'outline'}
                              className={`font-semibold ${
                                isTopThree ? 'bg-yellow-500 text-white' : ''
                              }`}
                            >
                              {totalBugs}
                            </Badge>
                          </TableCell>
                          <TableCell className='text-center'>
                            <Badge
                              variant={
                                resolvedBugs > 0 ? 'default' : 'secondary'
                              }
                              className='font-semibold'
                            >
                              {resolvedBugs}
                            </Badge>
                          </TableCell>
                          <TableCell className='text-center'>
                            <div className='flex items-center justify-center gap-2'>
                              <div className='text-sm font-medium'>
                                {resolvedPercentage}%
                              </div>
                              <div className='w-16 h-2 bg-gray-200 rounded-full overflow-hidden'>
                                <div
                                  className={`h-full transition-all duration-500 ${
                                    resolvedPercentage >= 80
                                      ? 'bg-green-500'
                                      : resolvedPercentage >= 60
                                      ? 'bg-yellow-500'
                                      : resolvedPercentage >= 40
                                      ? 'bg-orange-500'
                                      : 'bg-red-500'
                                  }`}
                                  style={{ width: `${resolvedPercentage}%` }}
                                />
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            </div>
          )}
        </div>
      )}

      {!isLoading && leaderboard && leaderboard.length === 0 && (
        <div className='text-center py-16'>
          <Trophy className='w-16 h-16 mx-auto text-muted-foreground/50' />
          <h3 className='mt-4 text-lg font-semibold'>
            The Leaderboard is Empty
          </h3>
          <p className='mt-1 text-sm text-muted-foreground'>
            Be the first to report a bug and claim the top spot!
          </p>
        </div>
      )}
    </ContentLayout>
  );
}
