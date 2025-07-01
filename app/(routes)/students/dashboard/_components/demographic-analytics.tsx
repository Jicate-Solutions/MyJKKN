'use client';

import { useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
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
import { Users, UserCheck, Calendar, Home, Globe, Heart } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface DemographicAnalyticsProps {
  data?: {
    gender: Array<{
      gender: string;
      count: number;
      percentage: number;
    }>;
    entryType: Array<{
      type: string;
      count: number;
      percentage: number;
    }>;
    accommodationType: Array<{
      type: string;
      count: number;
      percentage: number;
    }>;
    religion: Array<{
      religion: string;
      count: number;
      percentage: number;
    }>;
    community: Array<{
      community: string;
      count: number;
      percentage: number;
    }>;
    ageGroups: Array<{
      ageGroup: string;
      count: number;
      percentage: number;
    }>;
  };
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

export function DemographicAnalytics({
  data,
  isLoading
}: DemographicAnalyticsProps) {
  const chartData = useMemo(() => {
    if (!data)
      return {
        gender: [],
        entryType: [],
        accommodationType: [],
        religion: [],
        community: [],
        ageGroups: []
      };

    return {
      gender: data.gender.map((item, index) => ({
        name: item.gender || 'Not Specified',
        value: item.count,
        percentage: item.percentage,
        fill: COLORS[index % COLORS.length]
      })),
      entryType: data.entryType.map((item, index) => ({
        name: item.type || 'Not Specified',
        value: item.count,
        percentage: item.percentage,
        fill: COLORS[index % COLORS.length]
      })),
      accommodationType: data.accommodationType.map((item, index) => ({
        name: item.type || 'Not Specified',
        value: item.count,
        percentage: item.percentage,
        fill: COLORS[index % COLORS.length]
      })),
      religion: data.religion.map((item, index) => ({
        name: item.religion || 'Not Specified',
        value: item.count,
        percentage: item.percentage,
        fill: COLORS[index % COLORS.length]
      })),
      community: data.community.map((item, index) => ({
        name: item.community || 'Not Specified',
        value: item.count,
        percentage: item.percentage,
        fill: COLORS[index % COLORS.length]
      })),
      ageGroups: data.ageGroups.map((item, index) => ({
        name: item.ageGroup,
        value: item.count,
        percentage: item.percentage,
        fill: COLORS[index % COLORS.length]
      }))
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className='h-6 w-32' />
              <Skeleton className='h-4 w-48' />
            </CardHeader>
            <CardContent>
              <Skeleton className='h-[250px] w-full' />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!data) return null;

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className='bg-background border rounded-lg shadow-lg p-3'>
          <p className='font-medium'>{data.name}</p>
          <div className='space-y-1 mt-2'>
            <div className='flex items-center justify-between gap-4'>
              <span className='text-sm text-muted-foreground'>Count:</span>
              <span className='font-medium'>{data.value.toLocaleString()}</span>
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

  const PieChartComponent = ({
    data,
    title
  }: {
    data: any[];
    title: string;
  }) => (
    <div className='h-[250px]'>
      <ResponsiveContainer width='100%' height='100%'>
        <PieChart>
          <Pie
            data={data}
            cx='50%'
            cy='50%'
            innerRadius={40}
            outerRadius={80}
            paddingAngle={2}
            dataKey='value'
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );

  const BarChartComponent = ({
    data,
    title
  }: {
    data: any[];
    title: string;
  }) => (
    <div className='h-[250px]'>
      <ResponsiveContainer width='100%' height='100%'>
        <BarChart
          data={data}
          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray='3 3' className='opacity-30' />
          <XAxis
            dataKey='name'
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey='value' radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <div className='space-y-6'>
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
        {/* Gender Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Users className='h-5 w-5' />
              Gender Distribution
            </CardTitle>
            <CardDescription>Student enrollment by gender</CardDescription>
          </CardHeader>
          <CardContent>
            <PieChartComponent data={chartData.gender} title='Gender' />
            <div className='mt-4 space-y-2'>
              {chartData.gender.map((item, index) => (
                <div
                  key={item.name}
                  className='flex items-center justify-between p-2 border rounded'
                >
                  <div className='flex items-center gap-2'>
                    <div
                      className='w-3 h-3 rounded-full'
                      style={{ backgroundColor: item.fill }}
                    />
                    <span className='text-sm font-medium'>{item.name}</span>
                  </div>
                  <div className='text-right'>
                    <div className='text-sm font-semibold'>
                      {item.value.toLocaleString()}
                    </div>
                    <div className='text-xs text-muted-foreground'>
                      {item.percentage.toFixed(1)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Age Groups */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Calendar className='h-5 w-5' />
              Age Distribution
            </CardTitle>
            <CardDescription>Student enrollment by age groups</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChartComponent data={chartData.ageGroups} title='Age Groups' />
          </CardContent>
        </Card>

        {/* Entry Type */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <UserCheck className='h-5 w-5' />
              Entry Type Distribution
            </CardTitle>
            <CardDescription>Student enrollment by entry type</CardDescription>
          </CardHeader>
          <CardContent>
            <PieChartComponent data={chartData.entryType} title='Entry Type' />
          </CardContent>
        </Card>

        {/* Accommodation Type */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Home className='h-5 w-5' />
              Accommodation Distribution
            </CardTitle>
            <CardDescription>Student accommodation preferences</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChartComponent
              data={chartData.accommodationType}
              title='Accommodation'
            />
          </CardContent>
        </Card>

        {/* Religion */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Heart className='h-5 w-5' />
              Religion Distribution
            </CardTitle>
            <CardDescription>Student enrollment by religion</CardDescription>
          </CardHeader>
          <CardContent>
            <PieChartComponent data={chartData.religion} title='Religion' />
          </CardContent>
        </Card>

        {/* Community */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Globe className='h-5 w-5' />
              Community Distribution
            </CardTitle>
            <CardDescription>Student enrollment by community</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChartComponent data={chartData.community} title='Community' />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
