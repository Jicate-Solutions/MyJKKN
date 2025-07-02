'use client';

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
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
import { User, CheckCircle, AlertCircle, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { StaffProfileAnalytics } from '@/types/staff';

interface ProfileAnalyticsProps {
  data?: StaffProfileAnalytics;
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

export function ProfileAnalytics({ data, isLoading }: ProfileAnalyticsProps) {
  const completionData = useMemo(() => {
    if (!data?.profileCompletionBreakdown) return [];

    return data.profileCompletionBreakdown.map((item, index) => ({
      ...item,
      fill: COLORS[index % COLORS.length]
    }));
  }, [data?.profileCompletionBreakdown]);

  const categoryCompletionData = useMemo(() => {
    if (!data?.profileCompletionByCategory) return [];

    return data.profileCompletionByCategory.map((item, index) => ({
      ...item,
      fill: COLORS[index % COLORS.length]
    }));
  }, [data?.profileCompletionByCategory]);

  const missingFieldsData = useMemo(() => {
    if (!data?.missingFields) return [];

    return data.missingFields.map((item, index) => ({
      ...item,
      fill: COLORS[index % COLORS.length]
    }));
  }, [data?.missingFields]);

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

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <User className='h-5 w-5' />
            Profile Analytics
          </CardTitle>
          <CardDescription>No data available</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex items-center justify-center h-[350px] text-muted-foreground'>
            <div className='text-center'>
              <User className='h-12 w-12 mx-auto mb-4 opacity-50' />
              <p>No profile data available</p>
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
          <p className='font-medium'>{data.field || data.categoryName}</p>
          <div className='space-y-1 mt-2'>
            {data.completedCount !== undefined && (
              <div className='flex items-center justify-between gap-4'>
                <span className='text-sm text-muted-foreground'>
                  Completed:
                </span>
                <span className='font-medium'>
                  {data.completedCount.toLocaleString()}
                </span>
              </div>
            )}
            {data.totalCount !== undefined && (
              <div className='flex items-center justify-between gap-4'>
                <span className='text-sm text-muted-foreground'>Total:</span>
                <span className='font-medium'>
                  {data.totalCount.toLocaleString()}
                </span>
              </div>
            )}
            {data.percentage !== undefined && (
              <div className='flex items-center justify-between gap-4'>
                <span className='text-sm text-muted-foreground'>
                  Completion:
                </span>
                <span className='font-medium'>
                  {data.percentage.toFixed(1)}%
                </span>
              </div>
            )}
            {data.missingCount !== undefined && (
              <div className='flex items-center justify-between gap-4'>
                <span className='text-sm text-muted-foreground'>Missing:</span>
                <span className='font-medium'>
                  {data.missingCount.toLocaleString()}
                </span>
              </div>
            )}
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
              <User className='h-5 w-5' />
              Profile Analytics
            </CardTitle>
            <CardDescription>
              Staff profile completion analysis and insights
            </CardDescription>
          </div>
          <Badge variant='outline'>Profile Insights</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue='completion' className='space-y-4'>
          <TabsList>
            <TabsTrigger value='completion'>Field Completion</TabsTrigger>
            <TabsTrigger value='categories'>By Category</TabsTrigger>
            <TabsTrigger value='missing'>Missing Fields</TabsTrigger>
          </TabsList>

          <TabsContent value='completion' className='space-y-4'>
            <div className='space-y-4'>
              <h4 className='text-lg font-semibold flex items-center gap-2'>
                <CheckCircle className='h-4 w-4' />
                Profile Field Completion
              </h4>
              <div className='h-[300px]'>
                <ResponsiveContainer width='100%' height='100%'>
                  <BarChart
                    data={completionData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray='3 3'
                      className='opacity-30'
                    />
                    <XAxis
                      dataKey='field'
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
                    <Bar dataKey='percentage' radius={[4, 4, 0, 0]}>
                      {completionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                <Card>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-lg'>
                      Completion Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='space-y-3'>
                      {completionData.slice(0, 5).map((item) => (
                        <div
                          key={item.field}
                          className='flex justify-between items-center'
                        >
                          <span className='text-sm'>{item.field}:</span>
                          <div className='text-right'>
                            <div className='font-medium'>
                              {item.percentage.toFixed(1)}%
                            </div>
                            <div className='text-xs text-muted-foreground'>
                              {item.completedCount}/{item.totalCount}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-lg'>Key Metrics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='space-y-3'>
                      <div className='flex justify-between items-center'>
                        <span className='text-sm'>Highest Completion:</span>
                        <div className='text-right'>
                          <div className='font-medium'>
                            {completionData.length > 0
                              ? Math.max(
                                  ...completionData.map(
                                    (item) => item.percentage
                                  )
                                ).toFixed(1)
                              : '0'}
                            %
                          </div>
                          <div className='text-xs text-muted-foreground'>
                            {completionData.find(
                              (item) =>
                                item.percentage ===
                                Math.max(
                                  ...completionData.map((i) => i.percentage)
                                )
                            )?.field || 'N/A'}
                          </div>
                        </div>
                      </div>
                      <div className='flex justify-between items-center'>
                        <span className='text-sm'>Average Completion:</span>
                        <div className='text-right'>
                          <div className='font-medium'>
                            {completionData.length > 0
                              ? (
                                  completionData.reduce(
                                    (sum, item) => sum + item.percentage,
                                    0
                                  ) / completionData.length
                                ).toFixed(1)
                              : '0'}
                            %
                          </div>
                        </div>
                      </div>
                      <div className='flex justify-between items-center'>
                        <span className='text-sm'>Fields Tracked:</span>
                        <div className='text-right'>
                          <div className='font-medium'>
                            {completionData.length}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value='categories' className='space-y-4'>
            <div className='space-y-4'>
              <h4 className='text-lg font-semibold flex items-center gap-2'>
                <Users className='h-4 w-4' />
                Profile Completion by Category
              </h4>
              <div className='h-[300px]'>
                <ResponsiveContainer width='100%' height='100%'>
                  <BarChart
                    data={categoryCompletionData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray='3 3'
                      className='opacity-30'
                    />
                    <XAxis
                      dataKey='categoryName'
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
                      dataKey='percentage'
                      radius={[4, 4, 0, 0]}
                      fill='#10b981'
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className='space-y-3'>
                {categoryCompletionData.map((category) => (
                  <div
                    key={category.categoryName}
                    className='flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors'
                  >
                    <div>
                      <h3 className='font-medium'>{category.categoryName}</h3>
                      <div className='text-sm text-muted-foreground'>
                        {category.completedCount} of {category.totalCount}{' '}
                        profiles completed
                      </div>
                    </div>
                    <div className='text-right'>
                      <div className='text-lg font-bold text-green-600'>
                        {category.percentage.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value='missing' className='space-y-4'>
            <div className='space-y-4'>
              <h4 className='text-lg font-semibold flex items-center gap-2'>
                <AlertCircle className='h-4 w-4' />
                Most Missing Profile Fields
              </h4>
              <div className='h-[300px]'>
                <ResponsiveContainer width='100%' height='100%'>
                  <BarChart
                    data={missingFieldsData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray='3 3'
                      className='opacity-30'
                    />
                    <XAxis
                      dataKey='field'
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
                      dataKey='missingCount'
                      radius={[4, 4, 0, 0]}
                      fill='#ef4444'
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className='space-y-3'>
                <h4 className='font-semibold'>Priority Fields to Complete</h4>
                {missingFieldsData.slice(0, 5).map((field, index) => (
                  <div
                    key={field.field}
                    className='flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg'
                  >
                    <div className='flex items-center gap-3'>
                      <div className='flex items-center justify-center w-6 h-6 bg-red-500 text-white rounded-full text-xs font-bold'>
                        {index + 1}
                      </div>
                      <div>
                        <h3 className='font-medium'>{field.field}</h3>
                        <div className='text-sm text-muted-foreground'>
                          High priority for completion
                        </div>
                      </div>
                    </div>
                    <div className='text-right'>
                      <div className='text-lg font-bold text-red-600'>
                        {field.missingCount.toLocaleString()}
                      </div>
                      <div className='text-sm text-muted-foreground'>
                        {field.percentage.toFixed(1)}% missing
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
