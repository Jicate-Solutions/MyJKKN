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
import { Trophy, Medal, Award, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import ConfettiEffect from '@/components/magic-ui/confetti';

export default function BugLeaderboardPage() {
  const {
    data: leaderboard,
    isLoading,
    error,
    isFetching
  } = useBugLeaderboard('overall');

  const { data: weeklyData, isLoading: weekLoading } =
    useBugLeaderboard('week');

  const { data: monthlyData, isLoading: monthLoading } =
    useBugLeaderboard('month');
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

  const weeklyTop = weeklyData?.slice(0, 3) ?? [];
  const monthlyTop = monthlyData?.slice(0, 3) ?? [];

  const rank2 = topThree.length > 1 ? topThree[1] : null;
  const rank1 = topThree.length > 0 ? topThree[0] : null;
  const rank3 = topThree.length > 2 ? topThree[2] : null;

  return (
    <ContentLayout title='Bug Reporters Leaderboard'>
      {showConfetti && <ConfettiEffect />}
      {/* Hero section */}
      <section className='relative overflow-hidden rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-600 text-white shadow-xl mb-8'>
        <div className='absolute inset-0 opacity-10 bg-[url("/globe.svg")] bg-cover bg-center' />
        <div className='relative z-10 flex flex-col items-center justify-center text-center px-6 py-8 sm:py-12 space-y-2'>
          <Trophy className='w-10 h-10 sm:w-12 sm:h-12 text-yellow-300 drop-shadow-md' />
          <h2 className='text-2xl sm:text-3xl font-bold tracking-wide'>
            Bug Busters Hall of Fame
          </h2>
          <p className='max-w-md text-xs sm:text-sm opacity-90'>
            Celebrating our top contributors who help us squash bugs and make
            the platform better for everyone.
          </p>
          {isFetching && !isLoading && (
            <div className='flex items-center justify-center gap-2 text-xs sm:text-sm text-white/90 pt-2'>
              <div className='w-2 h-2 bg-green-300 rounded-full animate-pulse'></div>
              <span>Updating rankings…</span>
            </div>
          )}
        </div>
      </section>

      {isLoading && (
        <div className='flex justify-center items-center p-6 sm:p-8'>
          <Loader2 className='w-8 h-8 animate-spin text-primary' />
        </div>
      )}
      {error && (
        <div className='text-center p-6 sm:p-8 text-destructive text-sm sm:text-base'>
          Error loading leaderboard: {error.message}
        </div>
      )}

      {!isLoading && !error && leaderboard && leaderboard.length > 0 && (
        <div className='space-y-2'>
          {/* Top 3 Podium */}
          <div className='flex justify-center items-end gap-4 sm:gap-8 lg:gap-12 py-6 sm:py-8 px-4 sm:px-0'>
            {/* Rank 2 */}
            {rank2 && (
              <div className='flex flex-col items-center flex-1 max-w-[110px] sm:max-w-[130px]'>
                <div className='relative'>
                  <Avatar className='w-12 h-12 sm:w-16 sm:h-16 lg:w-20 lg:h-20 border-2 sm:border-4 border-gray-300'>
                    <AvatarImage src={rank2.avatar_url ?? ''} />
                    <AvatarFallback className='text-xs sm:text-sm'>
                      {rank2.user_name?.charAt(0) ?? 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className='absolute -bottom-2 sm:-bottom-3 left-1/2 -translate-x-1/2 w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8 bg-gray-300 rounded-full flex items-center justify-center text-gray-700 font-bold text-xs sm:text-sm'>
                    2
                  </div>
                </div>
                <h3 className='font-bold mt-3 sm:mt-4 text-center truncate text-xs sm:text-sm lg:text-base px-1'>
                  {rank2.user_name ?? 'Anonymous'}
                </h3>
                <p className='text-muted-foreground text-xs sm:text-sm'>
                  {rank2.total_bugs_count} reports
                </p>
              </div>
            )}
            {/*Spacer for alignment if only #1 exists*/}
            {!rank2 && rank1 && <div className='w-1/3 max-w-[120px]' />}

            {/* Rank 1 */}
            {rank1 && (
              <div className='flex flex-col items-center flex-1 max-w-[140px] sm:max-w-[160px] lg:max-w-[190px]'>
                <div className='relative'>
                  <Trophy className='w-6 h-6 sm:w-8 sm:h-8 text-yellow-400 absolute -top-4 sm:-top-6 left-1/2 -translate-x-1/2' />
                  <Avatar className='w-14 h-14 sm:w-16 sm:h-16 lg:w-24 lg:h-24 border-2 sm:border-4 border-yellow-400'>
                    <AvatarImage src={rank1.avatar_url ?? ''} />
                    <AvatarFallback className='text-xs sm:text-sm'>
                      {rank1.user_name?.charAt(0) ?? 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className='absolute -bottom-3 sm:-bottom-4 left-1/2 -translate-x-1/2 w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 bg-yellow-400 rounded-full flex items-center justify-center text-white font-bold text-sm sm:text-lg'>
                    1
                  </div>
                </div>
                <h3 className='font-bold mt-4 sm:mt-6 text-center truncate text-xs sm:text-sm lg:text-base px-1'>
                  {rank1.user_name ?? 'Anonymous'}
                </h3>
                <p className='text-muted-foreground text-xs sm:text-sm'>
                  {rank1.total_bugs_count} reports
                </p>
              </div>
            )}

            {/* Rank 3 */}
            {rank3 && (
              <div className='flex flex-col items-center flex-1 max-w-[110px] sm:max-w-[130px]'>
                <div className='relative'>
                  <Avatar className='w-12 h-12 sm:w-16 sm:h-16 lg:w-20 lg:h-20 border-2 sm:border-4 border-amber-600'>
                    <AvatarImage src={rank3.avatar_url ?? ''} />
                    <AvatarFallback className='text-xs sm:text-sm'>
                      {rank3.user_name?.charAt(0) ?? 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className='absolute -bottom-2 sm:-bottom-3 left-1/2 -translate-x-1/2 w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8 bg-amber-600 rounded-full flex items-center justify-center text-white font-bold text-xs sm:text-sm'>
                    3
                  </div>
                </div>
                <h3 className='font-semibold mt-3 sm:mt-4 text-center truncate text-xs sm:text-sm lg:text-base px-1'>
                  {rank3.user_name ?? 'Anonymous'}
                </h3>
                <p className='text-muted-foreground text-xs sm:text-sm'>
                  {rank3.total_bugs_count} reports
                </p>
              </div>
            )}
            {/*Spacer for alignment if only #1 exists*/}
            {!rank3 && rank1 && <div className='w-1/3 max-w-[120px]' />}
          </div>

          {/* Weekly & Monthly Podiums */}
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-8 pt-12'>
            {/* Weekly */}
            <section className='bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-900/10 dark:to-cyan-900/5 rounded-xl shadow border border-teal-100 dark:border-teal-800 p-6'>
              <h4 className='font-semibold text-teal-700 dark:text-teal-300 flex items-center gap-2 mb-6'>
                <Trophy className='w-5 h-5 text-amber-500' /> Weekly Champions
              </h4>
              {weekLoading && <p className='text-sm'>Loading…</p>}
              {!weekLoading && weeklyTop.length === 0 && (
                <p className='text-sm text-muted-foreground'>No data yet.</p>
              )}
              <div className='flex justify-center items-end gap-4'>
                {weeklyTop.map((user, idx) => (
                  <div
                    key={user.user_id}
                    className='flex flex-col items-center'
                  >
                    <Avatar className='w-14 h-14 border-2 border-teal-400 shadow-md'>
                      <AvatarImage src={user.avatar_url ?? ''} />
                      <AvatarFallback>
                        {user.user_name?.charAt(0) ?? 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <span className='mt-2 text-sm font-medium truncate max-w-[90px] text-center'>
                      {user.user_name}
                    </span>
                    <Badge variant='secondary' className='mt-1'>
                      #{idx + 1}
                    </Badge>
                  </div>
                ))}
              </div>
            </section>

            {/* Monthly */}
            <section className='bg-gradient-to-br from-rose-50 to-pink-50 dark:from-rose-900/10 dark:to-pink-900/5 rounded-xl shadow border border-rose-100 dark:border-rose-800 p-6'>
              <h4 className='font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-2 mb-6'>
                <Trophy className='w-5 h-5 text-amber-500' /> Monthly Legends
              </h4>
              {monthLoading && <p className='text-sm'>Loading…</p>}
              {!monthLoading && monthlyTop.length === 0 && (
                <p className='text-sm text-muted-foreground'>No data yet.</p>
              )}
              <div className='flex justify-center items-end gap-4'>
                {monthlyTop.map((user, idx) => (
                  <div
                    key={user.user_id}
                    className='flex flex-col items-center'
                  >
                    <Avatar className='w-14 h-14 border-2 border-rose-400 shadow-md'>
                      <AvatarImage src={user.avatar_url ?? ''} />
                      <AvatarFallback>
                        {user.user_name?.charAt(0) ?? 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <span className='mt-2 text-sm font-medium truncate max-w-[90px] text-center'>
                      {user.user_name}
                    </span>
                    <Badge variant='secondary' className='mt-1'>
                      #{idx + 1}
                    </Badge>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Complete Rankings - Enhanced Table Format (Overall) */}
          {leaderboard && leaderboard.length > 0 && (
            <div className='pt-8'>
              <div className='mb-4 sm:mb-6 px-2 sm:px-0'>
                <h3 className='text-lg sm:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2 sm:gap-3 mb-2'>
                  <div className='p-1.5 sm:p-2 bg-gradient-to-br from-amber-500 to-yellow-600 rounded-lg'>
                    <Award className='w-4 h-4 sm:w-5 sm:h-5 text-white' />
                  </div>
                  Complete Rankings
                </h3>
                <p className='text-muted-foreground text-xs sm:text-sm'>
                  All contributors ranked by their bug reporting activity
                </p>
              </div>

              <Card className='overflow-hidden'>
                <div className='overflow-x-auto'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className='w-16 text-center'>Rank</TableHead>
                        <TableHead>Contributor</TableHead>
                        <TableHead className='text-center'>Reports</TableHead>
                        <TableHead className='text-center'>Resolved</TableHead>
                        <TableHead className='text-center hidden sm:table-cell'>
                          Success Rate
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leaderboard.map((user, index) => {
                        const rank = index + 1;
                        const resolvedBugs = user.resolved_bugs_count || 0;
                        const totalBugs = user.total_bugs_count || 0;
                        const resolvedPercentage =
                          totalBugs > 0
                            ? Math.round((resolvedBugs / totalBugs) * 100)
                            : 0;

                        return (
                          <TableRow key={user.user_id}>
                            <TableCell className='text-center font-medium'>
                              {rank === 1 && (
                                <Trophy className='w-4 h-4 inline mr-1' />
                              )}
                              {rank === 2 && (
                                <Medal className='w-4 h-4 inline mr-1' />
                              )}
                              {rank === 3 && (
                                <Medal className='w-4 h-4 inline mr-1' />
                              )}
                              {rank}
                            </TableCell>
                            <TableCell>
                              <div className='flex items-center gap-3'>
                                <Avatar className='w-8 h-8'>
                                  <AvatarImage src={user.avatar_url ?? ''} />
                                  <AvatarFallback>
                                    {user.user_name?.charAt(0) ?? 'U'}
                                  </AvatarFallback>
                                </Avatar>
                                <span className='font-medium truncate max-w-[200px]'>
                                  {user.user_name ?? 'Anonymous'}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className='text-center'>
                              {totalBugs}
                            </TableCell>
                            <TableCell className='text-center'>
                              {resolvedBugs}
                            </TableCell>
                            <TableCell className='text-center hidden sm:table-cell'>
                              <div className='flex flex-col items-center gap-1'>
                                <span className='font-medium'>
                                  {resolvedPercentage}%
                                </span>
                                <div className='w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden'>
                                  <div
                                    className='h-full bg-gray-600 dark:bg-gray-400 transition-all duration-500'
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
                </div>
              </Card>
            </div>
          )}
        </div>
      )}

      {!isLoading && leaderboard && leaderboard.length === 0 && (
        <div className='text-center py-12 sm:py-16 px-4'>
          <Trophy className='w-12 h-12 sm:w-16 sm:h-16 mx-auto text-muted-foreground/50' />
          <h3 className='mt-3 sm:mt-4 text-base sm:text-lg font-semibold'>
            The Leaderboard is Empty
          </h3>
          <p className='mt-1 text-xs sm:text-sm text-muted-foreground max-w-md mx-auto'>
            Be the first to report a bug and claim the top spot!
          </p>
        </div>
      )}
    </ContentLayout>
  );
}
