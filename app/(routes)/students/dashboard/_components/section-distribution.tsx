'use client';

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface SectionDistributionProps {
  data?: Array<{
    id: string;
    name: string;
    studentCount: number;
    percentage: number;
    semesterName: string;
  }>;
  isLoading: boolean;
}

const COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#84cc16',
  '#f97316',
  '#ec4899',
  '#6366f1'
];

export function SectionDistribution({
  data,
  isLoading
}: SectionDistributionProps) {
  const chartData = useMemo(() => {
    if (!data) return [];

    return data.map((item, index) => ({
      ...item,
      displayName: `${item.name} (${item.semesterName})`,
      fullName: item.name,
      fill: COLORS[index % COLORS.length]
    }));
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className='h-6 w-48' />
          <Skeleton className='h-4 w-64' />
        </CardHeader>
        <CardContent>
          <Skeleton className='h-[400px] w-full' />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Users className='h-5 w-5' />
            Section Distribution
          </CardTitle>
          <CardDescription>No section data available</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex items-center justify-center h-[300px] text-muted-foreground'>
            <div className='text-center'>
              <Users className='h-12 w-12 mx-auto mb-4 opacity-50' />
              <p>No data to display</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className='bg-background border rounded-lg shadow-lg p-3'>
          <p className='font-medium'>{data.fullName}</p>
          <p className='text-sm text-muted-foreground'>{data.semesterName}</p>
          <div className='space-y-1 mt-2'>
            <div className='flex items-center justify-between gap-4'>
              <span className='text-sm text-muted-foreground'>Students:</span>
              <span className='font-medium'>
                {data.studentCount.toLocaleString()}
              </span>
            </div>
            <div className='flex items-center justify-between gap-4'>
              <span className='text-sm text-muted-foreground'>Percentage:</span>
              <span className='font-medium'>{data.percentage.toFixed(1)}%</span>
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
              <Users className='h-5 w-5' />
              Section Distribution
            </CardTitle>
            <CardDescription>
              Student enrollment across sections
            </CardDescription>
          </div>
          <Badge variant='outline' className='text-sm'>
            {data.length} sections
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className='h-[400px]'>
          <ResponsiveContainer width='100%' height='100%'>
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 20, bottom: 100 }}
              layout='horizontal'
            >
              <CartesianGrid strokeDasharray='3 3' className='opacity-30' />
              <XAxis type='number' />
              <YAxis
                type='category'
                dataKey='displayName'
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={150}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey='studentCount'
                name='Students'
                radius={[0, 4, 4, 0]}
                fill='#3b82f6'
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Section Summary */}
        <div className='mt-6 grid grid-cols-2 md:grid-cols-4 gap-4'>
          <div className='text-center p-3 border rounded-lg'>
            <div className='text-2xl font-bold text-blue-600'>
              {data.length}
            </div>
            <div className='text-sm text-muted-foreground'>Total Sections</div>
          </div>
          <div className='text-center p-3 border rounded-lg'>
            <div className='text-2xl font-bold text-green-600'>
              {Math.round(
                data.reduce((sum, item) => sum + item.studentCount, 0) /
                  data.length
              )}
            </div>
            <div className='text-sm text-muted-foreground'>Avg per Section</div>
          </div>
          <div className='text-center p-3 border rounded-lg'>
            <div className='text-2xl font-bold text-purple-600'>
              {Math.max(...data.map((item) => item.studentCount))}
            </div>
            <div className='text-sm text-muted-foreground'>Max Students</div>
          </div>
          <div className='text-center p-3 border rounded-lg'>
            <div className='text-2xl font-bold text-orange-600'>
              {Math.min(...data.map((item) => item.studentCount))}
            </div>
            <div className='text-sm text-muted-foreground'>Min Students</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
