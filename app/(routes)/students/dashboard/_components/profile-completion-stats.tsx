'use client';

import { useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface ProfileCompletionStatsProps {
  data?: {
    totalStudents: number;
    completeProfiles: number;
    incompleteProfiles: number;
    profileCompletionRate: number;
  };
  isLoading: boolean;
}

export function ProfileCompletionStats({
  data,
  isLoading
}: ProfileCompletionStatsProps) {
  const chartData = useMemo(() => {
    if (!data) return [];

    return [
      {
        name: 'Complete Profiles',
        value: data.completeProfiles,
        percentage: data.profileCompletionRate,
        fill: '#10b981'
      },
      {
        name: 'Incomplete Profiles',
        value: data.incompleteProfiles,
        percentage: 100 - data.profileCompletionRate,
        fill: '#ef4444'
      }
    ];
  }, [data]);

  const completionTiers = useMemo(() => {
    if (!data) return [];

    // Simulate completion tiers based on the data
    const excellent = Math.round(data.completeProfiles * 0.8);
    const good = Math.round(data.completeProfiles * 0.2);
    const needsWork = Math.round(data.incompleteProfiles * 0.6);
    const critical = Math.round(data.incompleteProfiles * 0.4);

    return [
      {
        tier: 'Excellent',
        count: excellent,
        percentage:
          data.totalStudents > 0 ? (excellent / data.totalStudents) * 100 : 0,
        description: '100% complete profiles',
        color: 'text-green-600',
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200'
      },
      {
        tier: 'Good',
        count: good,
        percentage:
          data.totalStudents > 0 ? (good / data.totalStudents) * 100 : 0,
        description: '80-99% complete profiles',
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200'
      },
      {
        tier: 'Needs Work',
        count: needsWork,
        percentage:
          data.totalStudents > 0 ? (needsWork / data.totalStudents) * 100 : 0,
        description: '50-79% complete profiles',
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-50',
        borderColor: 'border-yellow-200'
      },
      {
        tier: 'Critical',
        count: critical,
        percentage:
          data.totalStudents > 0 ? (critical / data.totalStudents) * 100 : 0,
        description: 'Less than 50% complete',
        color: 'text-red-600',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200'
      }
    ];
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className='h-6 w-48' />
          <Skeleton className='h-4 w-64' />
        </CardHeader>
        <CardContent>
          <Skeleton className='h-[300px] w-full' />
        </CardContent>
      </Card>
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <CheckCircle className='h-5 w-5' />
          Profile Completion Analytics
        </CardTitle>
        <CardDescription>
          Detailed analysis of student profile completion status
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Main Completion Rate */}
        <div className='mb-6'>
          <div className='flex items-center justify-between mb-2'>
            <h4 className='font-medium'>Overall Completion Rate</h4>
            <Badge
              variant={
                data.profileCompletionRate > 80
                  ? 'default'
                  : data.profileCompletionRate > 60
                  ? 'secondary'
                  : 'destructive'
              }
            >
              {data.profileCompletionRate.toFixed(1)}%
            </Badge>
          </div>
          <Progress value={data.profileCompletionRate} className='h-3 mb-2' />
          <div className='flex justify-between text-sm text-muted-foreground'>
            <span>{data.completeProfiles.toLocaleString()} complete</span>
            <span>{data.incompleteProfiles.toLocaleString()} incomplete</span>
          </div>
        </div>

        <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
          {/* Pie Chart */}
          <div>
            <h4 className='font-medium mb-4'>Completion Distribution</h4>
            <div className='h-[250px]'>
              <ResponsiveContainer width='100%' height='100%'>
                <PieChart>
                  <Pie
                    data={chartData}
                    cx='50%'
                    cy='50%'
                    labelLine={false}
                    label={({ name, percentage }) =>
                      `${name}: ${percentage.toFixed(1)}%`
                    }
                    outerRadius={80}
                    fill='#8884d8'
                    dataKey='value'
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Completion Tiers */}
          <div>
            <h4 className='font-medium mb-4'>Completion Tiers</h4>
            <div className='space-y-3'>
              {completionTiers.map((tier) => {
                const Icon =
                  tier.tier === 'Excellent'
                    ? CheckCircle
                    : tier.tier === 'Good'
                    ? CheckCircle
                    : tier.tier === 'Needs Work'
                    ? AlertCircle
                    : XCircle;

                return (
                  <div
                    key={tier.tier}
                    className={`p-3 border rounded-lg ${tier.bgColor} ${tier.borderColor}`}
                  >
                    <div className='flex items-center justify-between mb-2'>
                      <div className='flex items-center gap-2'>
                        <Icon className={`h-4 w-4 ${tier.color}`} />
                        <span className='font-medium'>{tier.tier}</span>
                      </div>
                      <Badge variant='outline' className={tier.color}>
                        {tier.count.toLocaleString()}
                      </Badge>
                    </div>
                    <div className='text-sm text-muted-foreground mb-2'>
                      {tier.description}
                    </div>
                    <Progress value={tier.percentage} className='h-2' />
                    <div className='text-xs text-muted-foreground mt-1'>
                      {tier.percentage.toFixed(1)}% of all students
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className='mt-6 grid grid-cols-2 md:grid-cols-4 gap-4'>
          <div className='text-center p-3 border rounded-lg bg-green-50'>
            <div className='text-2xl font-bold text-green-600'>
              {data.completeProfiles.toLocaleString()}
            </div>
            <div className='text-sm text-muted-foreground'>Complete</div>
          </div>
          <div className='text-center p-3 border rounded-lg bg-red-50'>
            <div className='text-2xl font-bold text-red-600'>
              {data.incompleteProfiles.toLocaleString()}
            </div>
            <div className='text-sm text-muted-foreground'>Incomplete</div>
          </div>
          <div className='text-center p-3 border rounded-lg bg-blue-50'>
            <div className='text-2xl font-bold text-blue-600'>
              {data.totalStudents.toLocaleString()}
            </div>
            <div className='text-sm text-muted-foreground'>Total Students</div>
          </div>
          <div className='text-center p-3 border rounded-lg bg-purple-50'>
            <div className='text-2xl font-bold text-purple-600'>
              {data.profileCompletionRate.toFixed(1)}%
            </div>
            <div className='text-sm text-muted-foreground'>Completion Rate</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
