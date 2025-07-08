'use client';

import { useBugLeaderboard } from '@/hooks/bug-reports/use-bug-reports';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ContentLayout } from '@/components/layout/content-layout';
import { Badge } from '@/components/ui/badge';

export default function BugLeaderboardPage() {
  const {
    data: leaderboard,
    isLoading,
    error,
    isFetching
  } = useBugLeaderboard();

  return (
    <ContentLayout title='Bug Reporters Leaderboard'>
      <div className='flex items-center justify-between mb-4'>
        <p className='text-muted-foreground'>
          Top users who have helped improve the platform by reporting bugs.
        </p>
        {isFetching && !isLoading && (
          <div className='flex items-center gap-2 text-sm text-muted-foreground'>
            <div className='w-2 h-2 bg-green-500 rounded-full animate-pulse'></div>
            <span>Updating...</span>
          </div>
        )}
      </div>

      {isLoading && <p>Loading leaderboard...</p>}
      {error && (
        <p className='text-destructive'>
          Error loading leaderboard: {error.message}
        </p>
      )}

      {!isLoading && !error && (
        <div className='rounded-md border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='w-[80px]'>Rank</TableHead>
                <TableHead>User</TableHead>
                <TableHead className='text-center'>Total Reports</TableHead>
                <TableHead className='text-center'>Resolved</TableHead>
                <TableHead className='text-center'>Success Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaderboard && leaderboard.length > 0 ? (
                leaderboard.map((entry, index) => {
                  const successRate =
                    entry.total_bugs_count > 0
                      ? Math.round(
                          (entry.resolved_bugs_count / entry.total_bugs_count) *
                            100
                        )
                      : 0;

                  return (
                    <TableRow key={entry.user_id}>
                      <TableCell className='font-medium text-lg'>
                        {index + 1}
                      </TableCell>
                      <TableCell>
                        <div className='flex items-center gap-3'>
                          <Avatar>
                            <AvatarImage
                              src={entry.avatar_url ?? ''}
                              alt={entry.user_name ?? 'User'}
                            />
                            <AvatarFallback>
                              {entry.user_name?.charAt(0) ?? 'U'}
                            </AvatarFallback>
                          </Avatar>
                          <span>{entry.user_name ?? 'Anonymous User'}</span>
                        </div>
                      </TableCell>
                      <TableCell className='text-center font-semibold'>
                        <Badge variant='outline' className='font-mono'>
                          {entry.total_bugs_count}
                        </Badge>
                      </TableCell>
                      <TableCell className='text-center font-semibold'>
                        <Badge
                          variant={
                            entry.resolved_bugs_count > 0
                              ? 'default'
                              : 'secondary'
                          }
                          className={
                            entry.resolved_bugs_count > 0
                              ? 'bg-green-500 hover:bg-green-600'
                              : ''
                          }
                        >
                          {entry.resolved_bugs_count}
                        </Badge>
                      </TableCell>
                      <TableCell className='text-center'>
                        <Badge
                          variant='outline'
                          className={`font-mono ${
                            successRate >= 75
                              ? 'border-green-500 text-green-700'
                              : successRate >= 50
                              ? 'border-yellow-500 text-yellow-700'
                              : successRate > 0
                              ? 'border-orange-500 text-orange-700'
                              : 'border-gray-500 text-gray-700'
                          }`}
                        >
                          {successRate}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className='text-center'>
                    No bug reports have been submitted yet. Be the first!
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </ContentLayout>
  );
}
