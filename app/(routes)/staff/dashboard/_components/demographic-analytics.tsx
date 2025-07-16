'use client';

import { useMemo, useCallback } from 'react';
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
import { Users, User, Calendar, Heart } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { StaffDemographicStats } from '@/types/staff';

interface DemographicAnalyticsProps {
  data?: StaffDemographicStats;
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
        <p className='font-medium'>{data.name}</p>
        <div className='space-y-1 mt-2'>
          <div className='flex items-center justify-between gap-4'>
            <span className='text-sm text-muted-foreground'>Count:</span>
            <span className='font-medium'>{data.count.toLocaleString()}</span>
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

export function DemographicAnalytics({
  data,
  isLoading
}: DemographicAnalyticsProps) {
  const genderChartData = useMemo(() => {
    if (!data?.genderDistribution) return [];

    return data.genderDistribution.map((item, index) => ({
      ...item,
      fill: COLORS[index % COLORS.length],
      uniqueKey: `gender-${item.name}-${index}` // Ensure unique keys
    }));
  }, [data?.genderDistribution]);

  const ageChartData = useMemo(() => {
    if (!data?.ageGroups) return [];

    return data.ageGroups.map((item, index) => ({
      ...item,
      fill: COLORS[index % COLORS.length],
      uniqueKey: `age-${item.name}-${index}` // Ensure unique keys
    }));
  }, [data?.ageGroups]);

  const maritalChartData = useMemo(() => {
    if (!data?.maritalStatusDistribution) return [];

    return data.maritalStatusDistribution.map((item, index) => ({
      ...item,
      fill: COLORS[index % COLORS.length],
      uniqueKey: `marital-${item.name}-${index}` // Ensure unique keys
    }));
  }, [data?.maritalStatusDistribution]);

  // Memoize the chart cell renderers to prevent recreation
  const renderGenderPieCells = useCallback(() => {
    return genderChartData.map((entry, index) => (
      <Cell key={`gender-pie-${entry.uniqueKey}`} fill={entry.fill} />
    ));
  }, [genderChartData]);

  const renderAgeBarCells = useCallback(() => {
    return ageChartData.map((entry, index) => (
      <Cell key={`age-bar-${entry.uniqueKey}`} fill={entry.fill} />
    ));
  }, [ageChartData]);

  const renderMaritalPieCells = useCallback(() => {
    return maritalChartData.map((entry, index) => (
      <Cell key={`marital-pie-${entry.uniqueKey}`} fill={entry.fill} />
    ));
  }, [maritalChartData]);

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
            <Users className='h-5 w-5' />
            Demographic Analytics
          </CardTitle>
          <CardDescription>No data available</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex items-center justify-center h-[350px] text-muted-foreground'>
            <div className='text-center'>
              <User className='h-12 w-12 mx-auto mb-4 opacity-50' />
              <p>No demographic data available</p>
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
              <Users className='h-5 w-5' />
              Demographic Analytics
            </CardTitle>
            <CardDescription>
              Staff demographics breakdown and analysis
            </CardDescription>
          </div>
          <Badge variant='outline'>Demographic Insights</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue='gender' className='space-y-4'>
          <TabsList>
            <TabsTrigger value='gender'>Gender</TabsTrigger>
            <TabsTrigger value='age'>Age Groups</TabsTrigger>
            <TabsTrigger value='marital'>Marital Status</TabsTrigger>
            <TabsTrigger value='summary'>Summary</TabsTrigger>
          </TabsList>

          <TabsContent value='gender' className='space-y-4'>
            <div className='grid md:grid-cols-2 gap-6'>
              <div className='h-[300px]'>
                <h4 className='text-lg font-semibold mb-4 flex items-center gap-2'>
                  <User className='h-4 w-4' />
                  Gender Distribution
                </h4>
                <ResponsiveContainer width='100%' height='100%'>
                  <PieChart>
                    <Pie
                      data={genderChartData}
                      cx='50%'
                      cy='50%'
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey='count'
                    >
                      {renderGenderPieCells()}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className='space-y-4'>
                <h4 className='text-lg font-semibold'>Gender Breakdown</h4>
                <div className='space-y-3'>
                  {genderChartData.map((item, index) => (
                    <div
                      key={`gender-breakdown-${item.uniqueKey}`}
                      className='flex items-center justify-between p-3 border rounded-lg'
                    >
                      <div className='flex items-center gap-3'>
                        <div
                          className='w-4 h-4 rounded-full'
                          style={{ backgroundColor: item.fill }}
                        />
                        <span className='font-medium capitalize'>
                          {item.name}
                        </span>
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

          <TabsContent value='age' className='space-y-4'>
            <div className='space-y-4'>
              <h4 className='text-lg font-semibold flex items-center gap-2'>
                <Calendar className='h-4 w-4' />
                Age Group Distribution
              </h4>
              <div className='h-[300px]'>
                <ResponsiveContainer width='100%' height='100%'>
                  <BarChart
                    data={ageChartData}
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
                    <Bar dataKey='count' radius={[4, 4, 0, 0]}>
                      {renderAgeBarCells()}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                {ageChartData.map((group, index) => (
                  <div
                    key={`age-group-${group.uniqueKey}`}
                    className='text-center p-3 bg-muted/50 rounded-lg'
                  >
                    <div
                      className='text-2xl font-bold'
                      style={{ color: group.fill }}
                    >
                      {group.count}
                    </div>
                    <div className='text-sm font-medium'>{group.name}</div>
                    <div className='text-xs text-muted-foreground'>
                      {group.percentage.toFixed(1)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value='marital' className='space-y-4'>
            <div className='grid md:grid-cols-2 gap-6'>
              <div className='h-[300px]'>
                <h4 className='text-lg font-semibold mb-4 flex items-center gap-2'>
                  <Heart className='h-4 w-4' />
                  Marital Status Distribution
                </h4>
                <ResponsiveContainer width='100%' height='100%'>
                  <PieChart>
                    <Pie
                      data={maritalChartData}
                      cx='50%'
                      cy='50%'
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey='count'
                    >
                      {renderMaritalPieCells()}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className='space-y-4'>
                <h4 className='text-lg font-semibold'>
                  Marital Status Breakdown
                </h4>
                <div className='space-y-3'>
                  {maritalChartData.map((item, index) => (
                    <div
                      key={`marital-breakdown-${item.uniqueKey}`}
                      className='flex items-center justify-between p-3 border rounded-lg'
                    >
                      <div className='flex items-center gap-3'>
                        <div
                          className='w-4 h-4 rounded-full'
                          style={{ backgroundColor: item.fill }}
                        />
                        <span className='font-medium capitalize'>
                          {item.name}
                        </span>
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

          <TabsContent value='summary' className='space-y-6'>
            <div className='grid gap-6'>
              {/* Demographics Summary */}
              <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                <Card>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-lg flex items-center gap-2'>
                      <User className='h-4 w-4' />
                      Gender
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='space-y-2'>
                      {genderChartData.slice(0, 3).map((item) => (
                        <div
                          key={`gender-summary-${item.uniqueKey}`}
                          className='flex justify-between text-sm'
                        >
                          <span className='capitalize'>{item.name}:</span>
                          <span className='font-medium'>
                            {item.percentage.toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-lg flex items-center gap-2'>
                      <Calendar className='h-4 w-4' />
                      Age Groups
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='space-y-2'>
                      {ageChartData.slice(0, 3).map((item) => (
                        <div
                          key={`age-summary-${item.uniqueKey}`}
                          className='flex justify-between text-sm'
                        >
                          <span>{item.name}:</span>
                          <span className='font-medium'>
                            {item.percentage.toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-lg flex items-center gap-2'>
                      <Heart className='h-4 w-4' />
                      Marital Status
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='space-y-2'>
                      {maritalChartData.slice(0, 3).map((item) => (
                        <div
                          key={`marital-summary-${item.uniqueKey}`}
                          className='flex justify-between text-sm'
                        >
                          <span className='capitalize'>{item.name}:</span>
                          <span className='font-medium'>
                            {item.percentage.toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Key Insights */}
              <Card>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    <Users className='h-5 w-5' />
                    Key Demographic Insights
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='grid md:grid-cols-2 gap-4'>
                    <div className='space-y-3'>
                      <h4 className='font-semibold'>Diversity Metrics</h4>
                      <ul className='space-y-2 text-sm'>
                        {genderChartData.length > 0 && (
                          <li className='flex justify-between'>
                            <span>Most represented gender:</span>
                            <span className='font-medium capitalize'>
                              {
                                genderChartData.reduce((max, item) =>
                                  item.count > max.count ? item : max
                                ).name
                              }
                            </span>
                          </li>
                        )}
                        {ageChartData.length > 0 && (
                          <li className='flex justify-between'>
                            <span>Largest age group:</span>
                            <span className='font-medium'>
                              {
                                ageChartData.reduce((max, item) =>
                                  item.count > max.count ? item : max
                                ).name
                              }
                            </span>
                          </li>
                        )}
                        {maritalChartData.length > 0 && (
                          <li className='flex justify-between'>
                            <span>Most common marital status:</span>
                            <span className='font-medium capitalize'>
                              {
                                maritalChartData.reduce((max, item) =>
                                  item.count > max.count ? item : max
                                ).name
                              }
                            </span>
                          </li>
                        )}
                      </ul>
                    </div>

                    <div className='space-y-3'>
                      <h4 className='font-semibold'>Demographics Statistics</h4>
                      <ul className='space-y-2 text-sm'>
                        <li className='flex justify-between'>
                          <span>Total demographic categories:</span>
                          <span className='font-medium'>
                            {genderChartData.length +
                              ageChartData.length +
                              maritalChartData.length}
                          </span>
                        </li>
                        <li className='flex justify-between'>
                          <span>Gender diversity:</span>
                          <span className='font-medium'>
                            {genderChartData.length} categories
                          </span>
                        </li>
                        <li className='flex justify-between'>
                          <span>Age range coverage:</span>
                          <span className='font-medium'>
                            {ageChartData.length} groups
                          </span>
                        </li>
                      </ul>
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
