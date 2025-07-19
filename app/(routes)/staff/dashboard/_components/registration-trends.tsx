'use client';

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Users, Calendar } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { StaffRegistrationTrend } from '@/types/staff';
import { format, parseISO } from 'date-fns';

interface RegistrationTrendsProps {
  data?: StaffRegistrationTrend[];
  isLoading: boolean;
}

export function RegistrationTrends({
  data,
  isLoading
}: RegistrationTrendsProps) {
  const chartData = useMemo(() => {
    if (!data) return [];

    return data.map((item) => ({
      date: item.date,
      count: item.count,
      cumulative: item.cumulative,
      formattedDate: format(parseISO(item.date), 'MMM dd'),
      fullDate: format(parseISO(item.date), 'MMMM dd, yyyy')
    }));
  }, [data]);

  const analytics = useMemo(() => {
    if (!data || data.length === 0) return null;

    const totalHires = data.reduce((sum, item) => sum + item.count, 0);
    const averagePerDay = totalHires / data.length;
    const peakDay = data.reduce((max, item) =>
      item.count > max.count ? item : max
    );

    // Calculate week-over-week growth
    const lastWeekData = data.slice(-7);
    const previousWeekData = data.slice(-14, -7);

    const lastWeekTotal = lastWeekData.reduce(
      (sum, item) => sum + item.count,
      0
    );
    const previousWeekTotal = previousWeekData.reduce(
      (sum, item) => sum + item.count,
      0
    );

    const weekOverWeekGrowth =
      previousWeekTotal > 0
        ? ((lastWeekTotal - previousWeekTotal) / previousWeekTotal) * 100
        : 0;

    return {
      totalHires,
      averagePerDay,
      peakDay,
      weekOverWeekGrowth,
      isGrowing: weekOverWeekGrowth > 0
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
          <Skeleton className='h-[350px] w-full' />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <TrendingUp className='h-5 w-5' />
            Facilitators Hiring Trends
          </CardTitle>
          <CardDescription>
            No data available for the selected period
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex items-center justify-center h-[350px] text-muted-foreground'>
            <div className='text-center'>
              <Calendar className='h-12 w-12 mx-auto mb-4 opacity-50' />
              <p>No hiring data available</p>
            </div>
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
            {payload.map((entry: any, index: number) => (
              <div
                key={`tooltip-entry-${entry.dataKey}-${index}`}
                className='flex items-center justify-between gap-4'
              >
                <span className='text-sm' style={{ color: entry.color }}>
                  {entry.dataKey === 'count' ? 'New Hires' : 'Total Staff'}:
                </span>
                <span className='font-medium'>{entry.value}</span>
              </div>
            ))}
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
              <TrendingUp className='h-5 w-5' />
              Facilitators Hiring Trends
            </CardTitle>
            <CardDescription>
              Facilitators hiring patterns over the last {data.length} days
            </CardDescription>
          </div>
          {analytics && (
            <div className='flex items-center gap-2'>
              <Badge variant={analytics.isGrowing ? 'default' : 'secondary'}>
                {analytics.isGrowing ? (
                  <TrendingUp className='h-3 w-3 mr-1' />
                ) : (
                  <TrendingDown className='h-3 w-3 mr-1' />
                )}
                {Math.abs(analytics.weekOverWeekGrowth).toFixed(1)}% WoW
              </Badge>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {analytics && (
          <div className='grid grid-cols-1 md:grid-cols-4 gap-4 mb-6'>
            <div className='text-center p-3 bg-muted/50 rounded-lg'>
              <div className='text-2xl font-bold text-primary'>
                {analytics.totalHires}
              </div>
              <div className='text-xs text-muted-foreground'>Total Hires</div>
            </div>
            <div className='text-center p-3 bg-muted/50 rounded-lg'>
              <div className='text-2xl font-bold text-primary'>
                {analytics.averagePerDay.toFixed(1)}
              </div>
              <div className='text-xs text-muted-foreground'>Avg. per Day</div>
            </div>
            <div className='text-center p-3 bg-muted/50 rounded-lg'>
              <div className='text-2xl font-bold text-primary'>
                {analytics.peakDay.count}
              </div>
              <div className='text-xs text-muted-foreground'>Peak Day</div>
            </div>
            <div className='text-center p-3 bg-muted/50 rounded-lg'>
              <div
                className={`text-2xl font-bold ${
                  analytics.isGrowing ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {analytics.weekOverWeekGrowth.toFixed(1)}%
              </div>
              <div className='text-xs text-muted-foreground'>WoW Growth</div>
            </div>
          </div>
        )}

        <Tabs defaultValue='daily' className='space-y-4'>
          <TabsList>
            <TabsTrigger value='daily'>Daily Hires</TabsTrigger>
            <TabsTrigger value='cumulative'>Cumulative</TabsTrigger>
          </TabsList>

          <TabsContent value='daily' className='space-y-4'>
            <div className='h-[300px]'>
              <ResponsiveContainer width='100%' height='100%'>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id='colorHires' x1='0' y1='0' x2='0' y2='1'>
                      <stop offset='5%' stopColor='#3b82f6' stopOpacity={0.8} />
                      <stop
                        offset='95%'
                        stopColor='#3b82f6'
                        stopOpacity={0.1}
                      />
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
                  <Area
                    type='monotone'
                    dataKey='count'
                    stroke='#3b82f6'
                    strokeWidth={2}
                    fillOpacity={1}
                    fill='url(#colorHires)'
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value='cumulative' className='space-y-4'>
            <div className='h-[300px]'>
              <ResponsiveContainer width='100%' height='100%'>
                <LineChart data={chartData}>
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
                  <Line
                    type='monotone'
                    dataKey='cumulative'
                    stroke='#10b981'
                    strokeWidth={3}
                    dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, stroke: '#10b981', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
