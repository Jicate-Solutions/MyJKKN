'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface NotificationStats {
  totalSent: number;
  thisMonth: number;
  today: number;
  successRate: number;
}

export function NotificationStats() {
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/admin/notifications/stats');

        if (!response.ok) {
          throw new Error('Failed to fetch notification statistics');
        }

        const data = await response.json();
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (isLoading) {
    return (
      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Loading...</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>-</div>
              <p className='text-xs text-muted-foreground'>Loading...</p>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Error</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>-</div>
              <p className='text-xs text-muted-foreground'>Failed to load</p>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
          <CardTitle className='text-sm font-medium'>Total Sent</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='text-2xl font-bold'>
            {stats.totalSent.toLocaleString()}
          </div>
          <p className='text-xs text-muted-foreground'>
            All time notifications
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
          <CardTitle className='text-sm font-medium'>This Month</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='text-2xl font-bold'>
            {stats.thisMonth.toLocaleString()}
          </div>
          <p className='text-xs text-muted-foreground'>
            Notifications sent this month
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
          <CardTitle className='text-sm font-medium'>Today</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='text-2xl font-bold'>
            {stats.today.toLocaleString()}
          </div>
          <p className='text-xs text-muted-foreground'>
            Notifications sent today
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
          <CardTitle className='text-sm font-medium'>Success Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='text-2xl font-bold'>{stats.successRate}%</div>
          <p className='text-xs text-muted-foreground'>Delivery success rate</p>
        </CardContent>
      </Card>
    </div>
  );
}
