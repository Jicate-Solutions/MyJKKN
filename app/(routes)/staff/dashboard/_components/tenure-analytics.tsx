'use client';

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
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
import { Clock, TrendingUp, Users, Award, Calendar } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { StaffTenureAnalytics } from '@/types/staff';

interface TenureAnalyticsProps {
  data?: StaffTenureAnalytics;
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

// Move CustomTooltip outside the component to prevent recreation on every render
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className='bg-background border rounded-lg shadow-lg p-3'>
        <p className='font-medium'>{data.range || data.year || data.name}</p>
        <div className='space-y-1 mt-2'>
          {data.count !== undefined && (
            <div className='flex items-center justify-between gap-4'>
              <span className='text-sm text-muted-foreground'>
                Facilitators Count:
              </span>
              <span className='font-medium'>{data.count.toLocaleString()}</span>
            </div>
          )}
          {data.percentage !== undefined && (
            <div className='flex items-center justify-between gap-4'>
              <span className='text-sm text-muted-foreground'>Percentage:</span>
              <span className='font-medium'>{data.percentage.toFixed(1)}%</span>
            </div>
          )}
          {data.averageTenure !== undefined && (
            <div className='flex items-center justify-between gap-4'>
              <span className='text-sm text-muted-foreground'>
                Avg. Tenure:
              </span>
              <span className='font-medium'>
                {data.averageTenure.toFixed(1)} yrs
              </span>
            </div>
          )}
          {data.retentionRate !== undefined && (
            <div className='flex items-center justify-between gap-4'>
              <span className='text-sm text-muted-foreground'>
                Retention Rate:
              </span>
              <span className='font-medium'>
                {data.retentionRate.toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
};

export function TenureAnalytics({ data, isLoading }: TenureAnalyticsProps) {
  const tenureDistributionData = useMemo(() => {
    if (!data?.tenureDistribution) return [];

    return data.tenureDistribution.map((item, index) => ({
      ...item,
      fill: COLORS[index % COLORS.length]
    }));
  }, [data?.tenureDistribution]);

  const newHiresData = useMemo(() => {
    if (!data?.newHiresTrend) return [];

    return data.newHiresTrend.map((item, index) => ({
      ...item,
      fill: COLORS[index % COLORS.length]
    }));
  }, [data?.newHiresTrend]);

  const categoryTenureData = useMemo(() => {
    if (!data?.averageTenureByCategory) return [];

    return data.averageTenureByCategory.map((item, index) => ({
      ...item,
      fill: COLORS[index % COLORS.length]
    }));
  }, [data?.averageTenureByCategory]);

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
            <Clock className='h-5 w-5' />
            Tenure Analytics
          </CardTitle>
          <CardDescription>No data available</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex items-center justify-center h-[350px] text-muted-foreground'>
            <div className='text-center'>
              <Clock className='h-12 w-12 mx-auto mb-4 opacity-50' />
              <p>No tenure data available</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className='flex items-center justify-between'>
          <div>
            <CardTitle className='flex items-center gap-2'>
              <Clock className='h-5 w-5' />
              Tenure Analytics
            </CardTitle>
            <CardDescription>
              Facilitators tenure distribution and retention analysis
            </CardDescription>
          </div>
          <div className='flex items-center gap-2'>
            <Badge variant='outline'>Tenure Analytics</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue='distribution' className='space-y-4'>
          <TabsList>
            <TabsTrigger value='distribution'>Tenure Distribution</TabsTrigger>
            <TabsTrigger value='trends'>New Hires Trend</TabsTrigger>
            <TabsTrigger value='categories'>By Category</TabsTrigger>
            <TabsTrigger value='insights'>Key Insights</TabsTrigger>
          </TabsList>

          <TabsContent value='distribution' className='space-y-4'>
            <div className='grid md:grid-cols-2 gap-6'>
              <div className='h-[300px]'>
                <h4 className='text-lg font-semibold mb-4 flex items-center gap-2'>
                  <Clock className='h-4 w-4' />
                  Tenure Distribution
                </h4>
                <ResponsiveContainer width='100%' height='100%'>
                  <PieChart>
                    <Pie
                      data={tenureDistributionData}
                      cx='50%'
                      cy='50%'
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey='count'
                    >
                      {tenureDistributionData.map((entry, index) => (
                        <Cell
                          key={`tenure-pie-${entry.range}-${index}`}
                          fill={entry.fill}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className='space-y-4'>
                <h4 className='text-lg font-semibold'>Tenure Breakdown</h4>
                <div className='space-y-3'>
                  {tenureDistributionData.map((item, index) => (
                    <div
                      key={`tenure-breakdown-${item.range}`}
                      className='flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors'
                    >
                      <div className='flex items-center gap-3'>
                        <div
                          className='w-4 h-4 rounded-full'
                          style={{ backgroundColor: item.fill }}
                        />
                        <span className='font-medium'>{item.range}</span>
                      </div>
                      <div className='text-right'>
                        <div className='font-bold'>
                          {item.count.toLocaleString()}
                        </div>
                        <div className='text-sm text-muted-foreground'>
                          {item.percentage.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value='trends' className='space-y-4'>
            <div className='space-y-4'>
              <h4 className='text-lg font-semibold flex items-center gap-2'>
                <TrendingUp className='h-4 w-4' />
                New Hires Monthly Trend
              </h4>
              <div className='h-[300px]'>
                <ResponsiveContainer width='100%' height='100%'>
                  <BarChart
                    data={newHiresData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray='3 3'
                      className='opacity-30'
                    />
                    <XAxis
                      dataKey='month'
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
                    <Bar dataKey='count' radius={[4, 4, 0, 0]} fill='#3b82f6' />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                <div className='text-center p-3 bg-muted/50 rounded-lg'>
                  <div className='text-2xl font-bold text-primary'>
                    {newHiresData.length > 0
                      ? Math.max(...newHiresData.map((item) => item.count))
                      : 0}
                  </div>
                  <div className='text-sm font-medium'>Peak Month</div>
                  <div className='text-xs text-muted-foreground'>
                    {newHiresData.find(
                      (item) =>
                        item.count ===
                        Math.max(...newHiresData.map((i) => i.count))
                    )?.month || 'N/A'}
                  </div>
                </div>
                <div className='text-center p-3 bg-muted/50 rounded-lg'>
                  <div className='text-2xl font-bold text-primary'>
                    {newHiresData.length > 0
                      ? (
                          newHiresData.reduce(
                            (sum, item) => sum + item.count,
                            0
                          ) / newHiresData.length
                        ).toFixed(0)
                      : 0}
                  </div>
                  <div className='text-sm font-medium'>Avg/Month</div>
                  <div className='text-xs text-muted-foreground'>
                    Hiring Rate
                  </div>
                </div>
                <div className='text-center p-3 bg-muted/50 rounded-lg'>
                  <div className='text-2xl font-bold text-primary'>
                    {newHiresData.length}
                  </div>
                  <div className='text-sm font-medium'>Months</div>
                  <div className='text-xs text-muted-foreground'>
                    Data Range
                  </div>
                </div>
                <div className='text-center p-3 bg-muted/50 rounded-lg'>
                  <div className='text-2xl font-bold text-primary'>
                    {newHiresData.reduce((sum, item) => sum + item.count, 0)}
                  </div>
                  <div className='text-sm font-medium'>Total</div>
                  <div className='text-xs text-muted-foreground'>All Hires</div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value='categories' className='space-y-4'>
            <div className='space-y-4'>
              <h4 className='text-lg font-semibold flex items-center gap-2'>
                <Users className='h-4 w-4' />
                Average Tenure by Category
              </h4>
              <div className='h-[300px]'>
                <ResponsiveContainer width='100%' height='100%'>
                  <BarChart
                    data={categoryTenureData}
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
                      dataKey='averageTenure'
                      radius={[4, 4, 0, 0]}
                      fill='#10b981'
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                <Card>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-lg'>
                      Category Highlights
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='space-y-3'>
                      {categoryTenureData.slice(0, 3).map((item) => (
                        <div
                          key={item.categoryName}
                          className='flex justify-between items-center'
                        >
                          <span className='text-sm'>{item.categoryName}:</span>
                          <div className='text-right'>
                            <div className='font-medium'>
                              {item.averageTenure.toFixed(1)} years
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-lg'>Tenure Metrics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='space-y-3'>
                      <div className='flex justify-between items-center'>
                        <span className='text-sm'>Highest Average:</span>
                        <div className='text-right'>
                          <div className='font-medium'>
                            {categoryTenureData.length > 0
                              ? Math.max(
                                  ...categoryTenureData.map(
                                    (item) => item.averageTenure
                                  )
                                ).toFixed(1)
                              : '0'}{' '}
                            years
                          </div>
                          <div className='text-xs text-muted-foreground'>
                            {categoryTenureData.find(
                              (item) =>
                                item.averageTenure ===
                                Math.max(
                                  ...categoryTenureData.map(
                                    (i) => i.averageTenure
                                  )
                                )
                            )?.categoryName || 'N/A'}
                          </div>
                        </div>
                      </div>
                      <div className='flex justify-between items-center'>
                        <span className='text-sm'>Overall Average:</span>
                        <div className='text-right'>
                          <div className='font-medium'>
                            {categoryTenureData.length > 0
                              ? (
                                  categoryTenureData.reduce(
                                    (sum, item) => sum + item.averageTenure,
                                    0
                                  ) / categoryTenureData.length
                                ).toFixed(1)
                              : '0'}{' '}
                            years
                          </div>
                        </div>
                      </div>
                      <div className='flex justify-between items-center'>
                        <span className='text-sm'>Categories Analyzed:</span>
                        <div className='text-right'>
                          <div className='font-medium'>
                            {categoryTenureData.length}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value='insights' className='space-y-6'>
            <div className='grid gap-6'>
              {/* Key Metrics */}
              <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                <Card>
                  <CardContent className='p-4 text-center'>
                    <div className='text-2xl font-bold text-primary'>
                      {tenureDistributionData.length}
                    </div>
                    <div className='text-sm font-medium'>Tenure Groups</div>
                    <div className='text-xs text-muted-foreground'>
                      Categories
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className='p-4 text-center'>
                    <div className='text-2xl font-bold text-green-600'>
                      {categoryTenureData.length}
                    </div>
                    <div className='text-sm font-medium'>
                      Employment Categories
                    </div>
                    <div className='text-xs text-muted-foreground'>
                      Analyzed
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className='p-4 text-center'>
                    <div className='text-2xl font-bold text-blue-600'>
                      {newHiresData.length}
                    </div>
                    <div className='text-sm font-medium'>Months of Data</div>
                    <div className='text-xs text-muted-foreground'>Trends</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className='p-4 text-center'>
                    <div className='text-2xl font-bold text-orange-600'>
                      {newHiresData.reduce((sum, item) => sum + item.count, 0)}
                    </div>
                    <div className='text-sm font-medium'>Total New Hires</div>
                    <div className='text-xs text-muted-foreground'>
                      All Periods
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Insights */}
              <Card>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    <Award className='h-5 w-5' />
                    Tenure Analysis Insights
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='grid md:grid-cols-2 gap-6'>
                    <div className='space-y-4'>
                      <h4 className='font-semibold'>Tenure Distribution</h4>
                      <div className='space-y-3'>
                        {tenureDistributionData.slice(0, 3).map((item) => (
                          <div
                            key={item.range}
                            className='flex justify-between items-center p-3 bg-muted/30 rounded-lg'
                          >
                            <div>
                              <div className='font-medium'>{item.range}</div>
                              <div className='text-sm text-muted-foreground'>
                                Tenure range
                              </div>
                            </div>
                            <div className='text-right'>
                              <div
                                className='text-lg font-bold'
                                style={{ color: item.fill }}
                              >
                                {item.count}
                              </div>
                              <div className='text-xs text-muted-foreground'>
                                {item.percentage.toFixed(1)}%
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className='space-y-4'>
                      <h4 className='font-semibold'>Category Analysis</h4>
                      <div className='space-y-3'>
                        {categoryTenureData.slice(0, 3).map((item) => (
                          <div
                            key={item.categoryName}
                            className='flex justify-between items-center p-3 bg-muted/30 rounded-lg'
                          >
                            <div>
                              <div className='font-medium'>
                                {item.categoryName}
                              </div>
                              <div className='text-sm text-muted-foreground'>
                                Employment category
                              </div>
                            </div>
                            <div className='text-right'>
                              <div className='text-lg font-bold text-green-600'>
                                {item.averageTenure.toFixed(1)}
                              </div>
                              <div className='text-xs text-muted-foreground'>
                                years avg.
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
