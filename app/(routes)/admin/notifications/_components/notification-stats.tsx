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
    <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
          <CardTitle className='text-sm font-medium'>Total Sent</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='text-2xl font-bold'>
            {stats.total_sent.toLocaleString()}
          </div>
          <p className='text-xs text-muted-foreground'>
            All time notifications
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
          <CardTitle className='text-sm font-medium'>Total Read</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='text-2xl font-bold'>
            {stats.total_read.toLocaleString()}
          </div>
          <p className='text-xs text-muted-foreground'>
            Notifications read by users
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
          <CardTitle className='text-sm font-medium'>Target Users</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='text-2xl font-bold'>
            {stats.target_users.toLocaleString()}
          </div>
          <p className='text-xs text-muted-foreground'>
            Users targeted by notifications
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
          <CardTitle className='text-sm font-medium'>Read Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='text-2xl font-bold'>{stats.read_percentage}%</div>
          <p className='text-xs text-muted-foreground'>
            Notification read rate
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
