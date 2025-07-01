'use client';

import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Calendar } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface RegistrationTrendsProps {
  data?: Array<{
    date: string;
    count: number;
    cumulative: number;
  }>;
  isLoading: boolean;
}

export function RegistrationTrends({
  data,
  isLoading
}: RegistrationTrendsProps) {
  const chartData = useMemo(() => {
    if (!data) return [];

    return data.map((item) => ({
      ...item,
      formattedDate: format(parseISO(item.date), 'MMM dd'),
      fullDate: format(parseISO(item.date), 'MMM dd, yyyy')
    }));
  }, [data]);

  const summary = useMemo(() => {
    if (!data || data.length === 0) return null;

    const totalRegistrations = data.reduce((sum, item) => sum + item.count, 0);
    const avgDaily = totalRegistrations / data.length;
    const lastWeekData = data.slice(-7);
    const lastWeekRegistrations = lastWeekData.reduce(
      (sum, item) => sum + item.count,
      0
    );
    const previousWeekData = data.slice(-14, -7);
    const previousWeekRegistrations = previousWeekData.reduce(
      (sum, item) => sum + item.count,
      0
    );

    const weeklyChange =
      previousWeekRegistrations > 0
        ? ((lastWeekRegistrations - previousWeekRegistrations) /
            previousWeekRegistrations) *
          100
        : 0;

    return {
      totalRegistrations,
      avgDaily: Math.round(avgDaily * 10) / 10,
      lastWeekRegistrations,
      weeklyChange: Math.round(weeklyChange * 10) / 10,
      trend: weeklyChange > 0 ? 'up' : weeklyChange < 0 ? 'down' : 'stable'
    };
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className='h-6 w-48' />
          <Skeleton className='h-4 w-64' />
        </CardHeader>
        <CardContent>
          <div className='space-y-4'>
            <div className='flex gap-4'>
              <Skeleton className='h-8 w-20' />
              <Skeleton className='h-8 w-20' />
              <Skeleton className='h-8 w-20' />
            </div>
            <Skeleton className='h-[300px] w-full' />
          </div>
        </CardContent>
      </Card>
    );
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className='bg-background border rounded-lg shadow-lg p-3'>
          <p className='font-medium'>{data.fullDate}</p>
          <div className='space-y-1 mt-2'>
            <div className='flex items-center justify-between gap-4'>
              <span className='text-sm text-muted-foreground'>
                New Registrations:
              </span>
              <span className='font-medium text-blue-600'>{data.count}</span>
            </div>
            <div className='flex items-center justify-between gap-4'>
              <span className='text-sm text-muted-foreground'>
                Total Students:
              </span>
              <span className='font-medium text-green-600'>
                {data.cumulative}
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <div className='flex items-center justify-between'>
          <div>
            <CardTitle className='flex items-center gap-2'>
              <Calendar className='h-5 w-5' />
              Registration Trends
            </CardTitle>
            <CardDescription>
              Student registration patterns over the last 30 days
            </CardDescription>
          </div>
          {summary && (
            <div className='flex items-center gap-2'>
              {summary.trend === 'up' ? (
                <TrendingUp className='h-4 w-4 text-green-600' />
              ) : summary.trend === 'down' ? (
                <TrendingDown className='h-4 w-4 text-red-600' />
              ) : null}
              <Badge
                variant={
                  summary.trend === 'up'
                    ? 'default'
                    : summary.trend === 'down'
                    ? 'destructive'
                    : 'secondary'
                }
              >
                {summary.weeklyChange > 0 ? '+' : ''}
                {summary.weeklyChange}% WoW
              </Badge>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {summary && (
          <div className='grid grid-cols-3 gap-4 mb-6'>
            <div className='text-center'>
              <div className='text-2xl font-bold text-blue-600'>
                {summary.totalRegistrations}
              </div>
              <div className='text-sm text-muted-foreground'>
                Total (30 days)
              </div>
            </div>
            <div className='text-center'>
              <div className='text-2xl font-bold text-green-600'>
                {summary.avgDaily}
              </div>
              <div className='text-sm text-muted-foreground'>Avg per day</div>
            </div>
            <div className='text-center'>
              <div className='text-2xl font-bold text-purple-600'>
                {summary.lastWeekRegistrations}
              </div>
              <div className='text-sm text-muted-foreground'>Last 7 days</div>
            </div>
          </div>
        )}

        <div className='h-[300px]'>
          <ResponsiveContainer width='100%' height='100%'>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient
                  id='registrationGradient'
                  x1='0'
                  y1='0'
                  x2='0'
                  y2='1'
                >
                  <stop offset='5%' stopColor='#3b82f6' stopOpacity={0.3} />
                  <stop offset='95%' stopColor='#3b82f6' stopOpacity={0.1} />
                </linearGradient>
                <linearGradient
                  id='cumulativeGradient'
                  x1='0'
                  y1='0'
                  x2='0'
                  y2='1'
                >
                  <stop offset='5%' stopColor='#10b981' stopOpacity={0.3} />
                  <stop offset='95%' stopColor='#10b981' stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray='3 3' className='opacity-30' />
              <XAxis
                dataKey='formattedDate'
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} />

              {/* Daily Registrations */}
              <Area
                type='monotone'
                dataKey='count'
                stroke='#3b82f6'
                strokeWidth={2}
                fill='url(#registrationGradient)'
                name='Daily Registrations'
              />

              {/* Cumulative Line */}
              <Line
                type='monotone'
                dataKey='cumulative'
                stroke='#10b981'
                strokeWidth={2}
                dot={false}
                name='Total Students'
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
