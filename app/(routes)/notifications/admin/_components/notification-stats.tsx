'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NotificationStats as NotificationStatsType } from '@/types/notifications';

interface NotificationStatsProps {
  stats: NotificationStatsType | null;
}

export function NotificationStats({ stats }: NotificationStatsProps) {
  if (!stats) {
    // This can be a more specific error or empty state if needed
    return null;
  }

  return (
    <div className='grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-5'>
      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-6 sm:pb-2'>
          <CardTitle className='text-xs sm:text-sm font-medium'>Total Sent</CardTitle>
        </CardHeader>
        <CardContent className='p-3 pt-0 sm:p-6 sm:pt-0'>
          <div className='text-xl sm:text-2xl font-bold'>
            {(stats.total_sent ?? 0).toLocaleString()}
          </div>
          <p className='text-[10px] sm:text-xs text-muted-foreground'>
            All time notifications
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-6 sm:pb-2'>
          <CardTitle className='text-xs sm:text-sm font-medium'>Total Read</CardTitle>
        </CardHeader>
        <CardContent className='p-3 pt-0 sm:p-6 sm:pt-0'>
          <div className='text-xl sm:text-2xl font-bold'>
            {(stats.total_read ?? 0).toLocaleString()}
          </div>
          <p className='text-[10px] sm:text-xs text-muted-foreground'>
            Notifications read by users
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-6 sm:pb-2'>
          <CardTitle className='text-xs sm:text-sm font-medium'>Unique Users Reached</CardTitle>
        </CardHeader>
        <CardContent className='p-3 pt-0 sm:p-6 sm:pt-0'>
          <div className='text-xl sm:text-2xl font-bold'>
            {(stats.target_users ?? 0).toLocaleString()}
          </div>
          <p className='text-[10px] sm:text-xs text-muted-foreground'>
            Distinct users targeted
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-6 sm:pb-2'>
          <CardTitle className='text-xs sm:text-sm font-medium'>Read Rate</CardTitle>
        </CardHeader>
        <CardContent className='p-3 pt-0 sm:p-6 sm:pt-0'>
          <div className='text-xl sm:text-2xl font-bold'>{stats.read_percentage ?? 0}%</div>
          <p className='text-[10px] sm:text-xs text-muted-foreground'>
            Notification read rate
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-6 sm:pb-2'>
          <CardTitle className='text-xs sm:text-sm font-medium'>Acknowledged</CardTitle>
        </CardHeader>
        <CardContent className='p-3 pt-0 sm:p-6 sm:pt-0'>
          <div className='text-xl sm:text-2xl font-bold'>
            {(stats.acknowledged ?? 0).toLocaleString()}
          </div>
          <p className='text-[10px] sm:text-xs text-muted-foreground'>
            Notifications acknowledged
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
