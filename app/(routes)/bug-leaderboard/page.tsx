'use client';

import { useBugLeaderboard } from '@/hooks/bug-reports/use-bug-reports';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ContentLayout } from '@/components/layout/content-layout';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Trophy } from 'lucide-react';
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

          {/* Rest of the Leaderboard */}
          <div className='space-y-2 pt-8'>
            {restOfLeaderboard.map((user, index) => (
              <Card
                key={user.user_id}
                className='p-3 flex items-center justify-between'
              >
                <div className='flex items-center gap-4'>
                  <div className='font-bold text-lg w-6 text-center'>
                    {index + 4}
                  </div>
                  <Avatar className='w-10 h-10'>
                    <AvatarImage src={user.avatar_url ?? ''} />
                    <AvatarFallback>
                      {user.user_name?.charAt(0) ?? 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <span className='font-medium'>
                    {user.user_name ?? 'Anonymous'}
                  </span>
                </div>
                <Badge variant='outline' className='font-semibold'>
                  {user.total_bugs_count} reports
                </Badge>
              </Card>
            ))}
          </div>
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
