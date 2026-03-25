// app/(routes)/resource-management/resources/[id]/_components/usage-stats-tab.tsx

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  BarChart3,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2
} from 'lucide-react';
import type { Resource } from '@/types/resource-management';

interface UsageStatsTabProps {
  resource: Resource;
  stats: any;
  loading: boolean;
}

export function UsageStatsTab({
  resource,
  stats,
  loading
}: UsageStatsTabProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className='py-12 text-center'>
          <Loader2 className='h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground' />
          <p className='text-muted-foreground'>Loading usage statistics...</p>
        </CardContent>
      </Card>
    );
  }

  const getUtilizationColor = (rate: number) => {
    if (rate >= 80) return 'text-green-600';
    if (rate >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getUtilizationBadge = (rate: number) => {
    if (rate >= 80) return 'bg-green-100 text-green-800';
    if (rate >= 50) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  return (
    <div className='space-y-6'>
      {/* Overview Stats */}
      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium'>
              Total Reservations
            </CardTitle>
            <BarChart3 className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>
              {stats?.totalReservations || 0}
            </div>
            <p className='text-xs text-muted-foreground'>All-time bookings</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium'>Completed</CardTitle>
            <CheckCircle2 className='h-4 w-4 text-green-600' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-green-600'>
              {stats?.completedReservations || 0}
            </div>
            <p className='text-xs text-muted-foreground'>
              {stats?.totalReservations > 0
                ? `${(
                    (stats?.completedReservations / stats?.totalReservations) *
                    100
                  ).toFixed(1)}% of total`
                : 'No data'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium'>Cancelled</CardTitle>
            <XCircle className='h-4 w-4 text-red-600' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-red-600'>
              {stats?.cancelledReservations || 0}
            </div>
            <p className='text-xs text-muted-foreground'>
              {stats?.totalReservations > 0
                ? `${(
                    (stats?.cancelledReservations / stats?.totalReservations) *
                    100
                  ).toFixed(1)}% of total`
                : 'No data'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <CardTitle className='text-sm font-medium'>No-Shows</CardTitle>
            <AlertCircle className='h-4 w-4 text-yellow-600' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-yellow-600'>
              {stats?.noShowReservations || 0}
            </div>
            <p className='text-xs text-muted-foreground'>
              {stats?.totalReservations > 0
                ? `${(
                    (stats?.noShowReservations / stats?.totalReservations) *
                    100
                  ).toFixed(1)}% of total`
                : 'No data'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Utilization Rate */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <TrendingUp className='h-5 w-5' />
            Utilization Rate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='flex items-center justify-between'>
            <div>
              <div
                className={`text-5xl font-bold ${getUtilizationColor(
                  stats?.utilizationRate || 0
                )}`}
              >
                {stats?.utilizationRate?.toFixed(1) || 0}%
              </div>
              <p className='text-sm text-muted-foreground mt-2'>
                Based on completed vs total reservations
              </p>
            </div>

            <Badge
              className={`text-lg px-4 py-2 ${getUtilizationBadge(
                stats?.utilizationRate || 0
              )}`}
            >
              {stats?.utilizationRate >= 80
                ? 'Excellent'
                : stats?.utilizationRate >= 50
                ? 'Good'
                : 'Low'}
            </Badge>
          </div>

          {/* Progress Bar */}
          <div className='mt-6'>
            <div className='h-4 w-full bg-gray-200 rounded-full overflow-hidden'>
              <div
                className={`h-full transition-all ${
                  stats?.utilizationRate >= 80
                    ? 'bg-green-600'
                    : stats?.utilizationRate >= 50
                    ? 'bg-yellow-600'
                    : 'bg-red-600'
                }`}
                style={{ width: `${stats?.utilizationRate || 0}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Average Duration */}
      {stats?.averageDuration > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Clock className='h-5 w-5' />
              Average Duration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-3xl font-bold'>
              {stats.averageDuration.toFixed(1)} hours
            </div>
            <p className='text-sm text-muted-foreground mt-2'>
              Average booking duration
            </p>
          </CardContent>
        </Card>
      )}

      {/* Reservation Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Reservation Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='space-y-4'>
            {/* Completed */}
            <div className='space-y-2'>
              <div className='flex justify-between text-sm'>
                <span className='text-muted-foreground'>Completed</span>
                <span className='font-medium'>
                  {stats?.completedReservations || 0}
                </span>
              </div>
              <div className='h-2 w-full bg-gray-200 rounded-full overflow-hidden'>
                <div
                  className='h-full bg-green-600'
                  style={{
                    width: `${
                      stats?.totalReservations > 0
                        ? (stats?.completedReservations /
                            stats?.totalReservations) *
                          100
                        : 0
                    }%`
                  }}
                />
              </div>
            </div>

            {/* Cancelled */}
            <div className='space-y-2'>
              <div className='flex justify-between text-sm'>
                <span className='text-muted-foreground'>Cancelled</span>
                <span className='font-medium'>
                  {stats?.cancelledReservations || 0}
                </span>
              </div>
              <div className='h-2 w-full bg-gray-200 rounded-full overflow-hidden'>
                <div
                  className='h-full bg-red-600'
                  style={{
                    width: `${
                      stats?.totalReservations > 0
                        ? (stats?.cancelledReservations /
                            stats?.totalReservations) *
                          100
                        : 0
                    }%`
                  }}
                />
              </div>
            </div>

            {/* No-Shows */}
            <div className='space-y-2'>
              <div className='flex justify-between text-sm'>
                <span className='text-muted-foreground'>No-Shows</span>
                <span className='font-medium'>
                  {stats?.noShowReservations || 0}
                </span>
              </div>
              <div className='h-2 w-full bg-gray-200 rounded-full overflow-hidden'>
                <div
                  className='h-full bg-yellow-600'
                  style={{
                    width: `${
                      stats?.totalReservations > 0
                        ? (stats?.noShowReservations /
                            stats?.totalReservations) *
                          100
                        : 0
                    }%`
                  }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Insights */}
      <Card>
        <CardHeader>
          <CardTitle>Insights & Recommendations</CardTitle>
        </CardHeader>
        <CardContent className='space-y-3'>
          {stats?.utilizationRate >= 80 && (
            <div className='rounded-lg border border-green-200 bg-green-50 p-3'>
              <p className='text-sm text-green-800'>
                <strong>High Utilization:</strong> This resource is being used
                efficiently. Consider adding similar resources if demand
                increases.
              </p>
            </div>
          )}

          {stats?.utilizationRate < 50 && stats?.totalReservations > 0 && (
            <div className='rounded-lg border border-yellow-200 bg-yellow-50 p-3'>
              <p className='text-sm text-yellow-800'>
                <strong>Low Utilization:</strong> This resource has low usage.
                Consider promoting it or reviewing if it&apos;s still needed.
              </p>
            </div>
          )}

          {stats?.noShowReservations > stats?.completedReservations * 0.3 && (
            <div className='rounded-lg border border-red-200 bg-red-50 p-3'>
              <p className='text-sm text-red-800'>
                <strong>High No-Show Rate:</strong> Consider implementing
                stricter policies or reminder notifications.
              </p>
            </div>
          )}

          {stats?.totalReservations === 0 && (
            <div className='rounded-lg border border-blue-200 bg-blue-50 p-3'>
              <p className='text-sm text-blue-800'>
                <strong>No Reservations Yet:</strong> This resource hasn&apos;t
                been booked yet. Ensure it&apos;s properly configured and
                visible to users.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
