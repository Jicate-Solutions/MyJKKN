'use client';

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  FunnelChart,
  Funnel,
  LabelList
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
import {
  CheckCircle,
  AlertCircle,
  UserCheck,
  Clock,
  TrendingDown,
  Users,
  FileText,
  Target
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface OnboardingFunnelProps {
  data?: {
    profileCompletionFunnel: Array<{
      step: string;
      completed: number;
      total: number;
      percentage: number;
    }>;
    missingFields: Array<{
      field: string;
      missingCount: number;
      percentage: number;
    }>;
    timeToComplete: {
      average: number;
      median: number;
      distribution: Array<{
        range: string;
        count: number;
        percentage: number;
      }>;
    };
  };
  isLoading: boolean;
}

const COLORS = [
  '#10b981',
  '#3b82f6',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#84cc16',
  '#f97316',
  '#ec4899',
  '#6366f1'
];

export function OnboardingFunnel({ data, isLoading }: OnboardingFunnelProps) {
  const chartData = useMemo(() => {
    if (!data)
      return {
        funnelData: [],
        missingFieldsData: [],
        timeDistributionData: []
      };

    const funnelData = data.profileCompletionFunnel.map((item, index) => ({
      name: item.step,
      value: item.completed,
      total: item.total,
      percentage: item.percentage,
      fill: COLORS[index % COLORS.length],
      dropoff:
        index > 0
          ? data.profileCompletionFunnel[index - 1].completed - item.completed
          : 0
    }));

    const missingFieldsData = data.missingFields.map((item, index) => ({
      name: item.field,
      value: item.missingCount,
      percentage: item.percentage,
      fill: COLORS[index % COLORS.length]
    }));

    const timeDistributionData = data.timeToComplete.distribution.map(
      (item, index) => ({
        name: item.range,
        value: item.count,
        percentage: item.percentage,
        fill: COLORS[index % COLORS.length]
      })
    );

    return { funnelData, missingFieldsData, timeDistributionData };
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className='h-6 w-48' />
          <Skeleton className='h-4 w-64' />
        </CardHeader>
        <CardContent>
          <Skeleton className='h-[600px] w-full' />
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <UserCheck className='h-5 w-5' />
            Onboarding Progress
          </CardTitle>
          <CardDescription>
            Profile completion funnel and missing field analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='text-center py-8'>
            <UserCheck className='h-12 w-12 mx-auto mb-4 text-muted-foreground' />
            <p className='text-muted-foreground'>
              No onboarding data available
            </p>
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
          <p className='font-medium'>{label || data.name}</p>
          <div className='space-y-1 mt-2'>
            <div className='flex items-center justify-between gap-4'>
              <span className='text-sm text-muted-foreground'>Count:</span>
              <span className='font-medium'>
                {data.value?.toLocaleString()}
              </span>
            </div>
            <div className='flex items-center justify-between gap-4'>
              <span className='text-sm text-muted-foreground'>Percentage:</span>
              <span className='font-medium'>
                {data.percentage?.toFixed(1)}%
              </span>
            </div>
            {data.total && (
              <div className='flex items-center justify-between gap-4'>
                <span className='text-sm text-muted-foreground'>Total:</span>
                <span className='font-medium'>
                  {data.total.toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  const overallCompletionRate =
    data.profileCompletionFunnel.length > 0
      ? data.profileCompletionFunnel[data.profileCompletionFunnel.length - 1]
          .percentage
      : 0;

  const totalDropoffs = chartData.funnelData.reduce(
    (sum, step) => sum + step.dropoff,
    0
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <UserCheck className='h-5 w-5' />
          Onboarding Analytics
        </CardTitle>
        <CardDescription>
          Comprehensive analysis of student profile completion and onboarding
          effectiveness
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue='funnel' className='space-y-6'>
          <TabsList className='grid w-full grid-cols-3'>
            <TabsTrigger value='funnel' className='flex items-center gap-2'>
              <Target className='h-4 w-4' />
              Completion Funnel
            </TabsTrigger>
            <TabsTrigger
              value='missing-fields'
              className='flex items-center gap-2'
            >
              <FileText className='h-4 w-4' />
              Missing Fields
            </TabsTrigger>
            <TabsTrigger
              value='time-analysis'
              className='flex items-center gap-2'
            >
              <Clock className='h-4 w-4' />
              Time Analysis
            </TabsTrigger>
          </TabsList>

          {/* Funnel Analysis Tab */}
          <TabsContent value='funnel' className='space-y-6'>
            {/* Key Metrics */}
            <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
              <Card>
                <CardContent className='p-4'>
                  <div className='flex items-center gap-2 mb-2'>
                    <CheckCircle className='h-4 w-4 text-green-600' />
                    <span className='text-sm font-medium'>Completion Rate</span>
                  </div>
                  <div className='text-2xl font-bold text-green-600'>
                    {overallCompletionRate.toFixed(1)}%
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className='p-4'>
                  <div className='flex items-center gap-2 mb-2'>
                    <Users className='h-4 w-4 text-blue-600' />
                    <span className='text-sm font-medium'>Total Students</span>
                  </div>
                  <div className='text-2xl font-bold text-blue-600'>
                    {data.profileCompletionFunnel[0]?.total.toLocaleString() ||
                      0}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className='p-4'>
                  <div className='flex items-center gap-2 mb-2'>
                    <TrendingDown className='h-4 w-4 text-red-600' />
                    <span className='text-sm font-medium'>Total Dropoffs</span>
                  </div>
                  <div className='text-2xl font-bold text-red-600'>
                    {totalDropoffs.toLocaleString()}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className='p-4'>
                  <div className='flex items-center gap-2 mb-2'>
                    <FileText className='h-4 w-4 text-purple-600' />
                    <span className='text-sm font-medium'>Steps</span>
                  </div>
                  <div className='text-2xl font-bold text-purple-600'>
                    {data.profileCompletionFunnel.length}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Overall Progress */}
            <div className='space-y-4'>
              <div className='flex items-center justify-between'>
                <h4 className='font-medium'>Overall Completion Progress</h4>
                <Badge
                  variant={
                    overallCompletionRate > 80
                      ? 'default'
                      : overallCompletionRate > 60
                      ? 'secondary'
                      : 'destructive'
                  }
                >
                  {overallCompletionRate.toFixed(1)}%
                </Badge>
              </div>
              <Progress value={overallCompletionRate} className='h-3' />
            </div>

            {/* Funnel Steps Detail */}
            <div className='space-y-3'>
              <h4 className='font-medium'>Step-by-Step Analysis</h4>
              {chartData.funnelData.map((step, index) => {
                const dropoffRate =
                  step.total > 0 ? (step.dropoff / step.total) * 100 : 0;
                const isFirstStep = index === 0;

                return (
                  <div
                    key={step.name}
                    className='border rounded-lg p-4 space-y-3'
                  >
                    <div className='flex items-center justify-between'>
                      <div className='flex items-center gap-3'>
                        <div className='flex items-center gap-2'>
                          {step.percentage > 90 ? (
                            <CheckCircle className='h-5 w-5 text-green-600' />
                          ) : step.percentage > 70 ? (
                            <CheckCircle className='h-5 w-5 text-yellow-600' />
                          ) : (
                            <AlertCircle className='h-5 w-5 text-red-600' />
                          )}
                          <span className='font-medium text-lg'>
                            {step.name}
                          </span>
                        </div>
                      </div>
                      <div className='flex items-center gap-4'>
                        <div className='text-right'>
                          <div className='text-sm text-muted-foreground'>
                            Completed
                          </div>
                          <div className='font-semibold'>
                            {step.value.toLocaleString()} /{' '}
                            {step.total.toLocaleString()}
                          </div>
                        </div>
                        <Badge
                          variant={
                            step.percentage > 90
                              ? 'default'
                              : step.percentage > 70
                              ? 'secondary'
                              : 'destructive'
                          }
                        >
                          {step.percentage.toFixed(1)}%
                        </Badge>
                      </div>
                    </div>

                    <Progress value={step.percentage} className='h-2' />

                    <div className='flex items-center justify-between text-sm'>
                      <span className='text-muted-foreground'>
                        {step.percentage.toFixed(1)}% completion rate
                      </span>
                      {!isFirstStep && step.dropoff > 0 && (
                        <div className='flex items-center gap-2'>
                          <Badge variant='outline' className='text-red-600'>
                            <TrendingDown className='h-3 w-3 mr-1' />
                            {step.dropoff.toLocaleString()} dropoffs (
                            {dropoffRate.toFixed(1)}%)
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {/* Missing Fields Tab */}
          <TabsContent value='missing-fields' className='space-y-6'>
            <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
              {/* Bar Chart */}
              <div>
                <h4 className='font-medium mb-4'>Most Common Missing Fields</h4>
                <div className='h-[350px]'>
                  <ResponsiveContainer width='100%' height='100%'>
                    <BarChart
                      data={chartData.missingFieldsData}
                      margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid
                        strokeDasharray='3 3'
                        className='opacity-30'
                      />
                      <XAxis
                        dataKey='name'
                        tick={{ fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                        angle={-45}
                        textAnchor='end'
                        height={80}
                      />
                      <YAxis
                        tick={{ fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar
                        dataKey='value'
                        name='Missing Count'
                        radius={[4, 4, 0, 0]}
                      >
                        {chartData.missingFieldsData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Pie Chart */}
              <div>
                <h4 className='font-medium mb-4'>
                  Missing Fields Distribution
                </h4>
                <div className='h-[350px]'>
                  <ResponsiveContainer width='100%' height='100%'>
                    <PieChart>
                      <Pie
                        data={chartData.missingFieldsData}
                        cx='50%'
                        cy='50%'
                        outerRadius={120}
                        dataKey='value'
                        label={({ name, percentage }) =>
                          `${name}: ${percentage.toFixed(1)}%`
                        }
                      >
                        {chartData.missingFieldsData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Missing Fields Details */}
            <div className='space-y-3'>
              <h4 className='font-medium'>Field Completion Priority</h4>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                {chartData.missingFieldsData.map((field, index) => (
                  <div
                    key={field.name}
                    className='flex items-center justify-between p-3 border rounded-lg'
                  >
                    <div className='flex items-center gap-3'>
                      <div
                        className='w-4 h-4 rounded-full'
                        style={{ backgroundColor: field.fill }}
                      />
                      <div>
                        <div className='font-medium text-sm'>{field.name}</div>
                        <div className='text-xs text-muted-foreground'>
                          Priority:{' '}
                          {field.percentage > 50
                            ? 'High'
                            : field.percentage > 25
                            ? 'Medium'
                            : 'Low'}
                        </div>
                      </div>
                    </div>
                    <div className='text-right'>
                      <div className='font-semibold text-red-600'>
                        {field.value.toLocaleString()}
                      </div>
                      <div className='text-xs text-muted-foreground'>
                        {field.percentage.toFixed(1)}% missing
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Time Analysis Tab */}
          <TabsContent value='time-analysis' className='space-y-6'>
            {/* Time Metrics */}
            <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
              <Card>
                <CardContent className='p-4'>
                  <div className='flex items-center gap-2 mb-2'>
                    <Clock className='h-4 w-4 text-blue-600' />
                    <span className='text-sm font-medium'>Average Time</span>
                  </div>
                  <div className='text-2xl font-bold text-blue-600'>
                    {data.timeToComplete.average.toFixed(1)} days
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className='p-4'>
                  <div className='flex items-center gap-2 mb-2'>
                    <Target className='h-4 w-4 text-green-600' />
                    <span className='text-sm font-medium'>Median Time</span>
                  </div>
                  <div className='text-2xl font-bold text-green-600'>
                    {data.timeToComplete.median.toFixed(1)} days
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className='p-4'>
                  <div className='flex items-center gap-2 mb-2'>
                    <Users className='h-4 w-4 text-purple-600' />
                    <span className='text-sm font-medium'>Total Analyzed</span>
                  </div>
                  <div className='text-2xl font-bold text-purple-600'>
                    {chartData.timeDistributionData
                      .reduce((sum, item) => sum + item.value, 0)
                      .toLocaleString()}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Time Distribution Chart */}
            <div>
              <h4 className='font-medium mb-4'>Completion Time Distribution</h4>
              <div className='h-[300px]'>
                <ResponsiveContainer width='100%' height='100%'>
                  <BarChart
                    data={chartData.timeDistributionData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray='3 3'
                      className='opacity-30'
                    />
                    <XAxis
                      dataKey='name'
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
                    <Bar
                      dataKey='value'
                      name='Student Count'
                      radius={[4, 4, 0, 0]}
                    >
                      {chartData.timeDistributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Time Distribution Details */}
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              {chartData.timeDistributionData.map((item, index) => (
                <div key={item.name} className='p-4 border rounded-lg'>
                  <div className='flex items-center justify-between mb-2'>
                    <div className='flex items-center gap-2'>
                      <div
                        className='w-3 h-3 rounded-full'
                        style={{ backgroundColor: item.fill }}
                      />
                      <span className='font-medium'>{item.name}</span>
                    </div>
                    <Badge variant='outline'>
                      {item.percentage.toFixed(1)}%
                    </Badge>
                  </div>
                  <div className='space-y-2'>
                    <Progress value={item.percentage} className='h-2' />
                    <div className='flex justify-between text-sm text-muted-foreground'>
                      <span>{item.value.toLocaleString()} students</span>
                      <span>{item.percentage.toFixed(1)}% of total</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
