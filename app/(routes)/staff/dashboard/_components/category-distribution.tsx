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
import { Tags, Users, TrendingUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { StaffCategoryStats } from '@/types/staff';

interface CategoryDistributionProps {
  data?: StaffCategoryStats[];
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

export function CategoryDistribution({
  data,
  isLoading
}: CategoryDistributionProps) {
  const chartData = useMemo(() => {
    if (!data) return [];

    return data.map((item, index) => ({
      ...item,
      fill: COLORS[index % COLORS.length]
    }));
  }, [data]);

  const topCategories = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => b.staffCount - a.staffCount).slice(0, 5);
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
            <Tags className='h-5 w-5' />
            Employment Category Distribution
          </CardTitle>
          <CardDescription>No data available</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex items-center justify-center h-[350px] text-muted-foreground'>
            <div className='text-center'>
              <Tags className='h-12 w-12 mx-auto mb-4 opacity-50' />
              <p>No category data available</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalStaff = data.reduce((sum, item) => sum + item.staffCount, 0);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className='bg-background border rounded-lg shadow-lg p-3'>
          <p className='font-medium'>{data.name}</p>
          <div className='space-y-1 mt-2'>
            <div className='flex items-center justify-between gap-4'>
              <span className='text-sm text-muted-foreground'>
                Staff Count:
              </span>
              <span className='font-medium'>
                {data.staffCount.toLocaleString()}
              </span>
            </div>
            <div className='flex items-center justify-between gap-4'>
              <span className='text-sm text-muted-foreground'>Percentage:</span>
              <span className='font-medium'>{data.percentage.toFixed(1)}%</span>
            </div>
            <div className='flex items-center justify-between gap-4'>
              <span className='text-sm text-green-600'>Active:</span>
              <span className='font-medium'>
                {data.activeCount.toLocaleString()}
              </span>
            </div>
            <div className='flex items-center justify-between gap-4'>
              <span className='text-sm text-red-600'>Inactive:</span>
              <span className='font-medium'>
                {data.inactiveCount.toLocaleString()}
              </span>
            </div>
            <div className='flex items-center justify-between gap-4'>
              <span className='text-sm text-blue-600'>Avg. Tenure:</span>
              <span className='font-medium'>
                {data.averageTenure.toFixed(1)} yrs
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
              <Tags className='h-5 w-5' />
              Employment Category Distribution
            </CardTitle>
            <CardDescription>
              Staff distribution across {data.length} employment categories
            </CardDescription>
          </div>
          <Badge variant='outline'>
            {totalStaff.toLocaleString()} Total Staff
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue='bar' className='space-y-4'>
          <TabsList>
            <TabsTrigger value='bar'>Bar Chart</TabsTrigger>
            <TabsTrigger value='pie'>Pie Chart</TabsTrigger>
            <TabsTrigger value='list'>Top Categories</TabsTrigger>
          </TabsList>

          <TabsContent value='bar' className='space-y-4'>
            <div className='h-[350px]'>
              <ResponsiveContainer width='100%' height='100%'>
                <BarChart
                  data={chartData}
                  margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray='3 3' className='opacity-30' />
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
                  <Bar dataKey='staffCount' radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`category-cell-${entry.id}-${index}`}
                        fill={entry.fill}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value='pie' className='space-y-4'>
            <div className='h-[350px]'>
              <ResponsiveContainer width='100%' height='100%'>
                <PieChart>
                  <Pie
                    data={chartData}
                    cx='50%'
                    cy='50%'
                    innerRadius={60}
                    outerRadius={120}
                    paddingAngle={2}
                    dataKey='staffCount'
                  >
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`category-pie-${entry.id}-${index}`}
                        fill={entry.fill}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value='list' className='space-y-4'>
            <div className='space-y-4'>
              {topCategories.map((category, index) => (
                <div
                  key={category.id}
                  className='flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors'
                >
                  <div className='flex items-center gap-3'>
                    <div className='flex items-center justify-center w-8 h-8 bg-primary text-white rounded-full text-sm font-bold'>
                      #{index + 1}
                    </div>
                    <div>
                      <h3 className='font-medium'>{category.name}</h3>
                      <div className='flex items-center gap-4 text-sm text-muted-foreground'>
                        <span className='flex items-center gap-1'>
                          <Users className='h-3 w-3' />
                          {category.staffCount.toLocaleString()} staff
                        </span>
                        <span className='flex items-center gap-1'>
                          <TrendingUp className='h-3 w-3 text-green-600' />
                          {category.activeCount} active
                        </span>
                      </div>
                      <div className='text-xs text-purple-600 mt-1'>
                        Avg. Tenure: {category.averageTenure.toFixed(1)} years
                      </div>
                    </div>
                  </div>
                  <div className='text-right'>
                    <div className='text-lg font-bold'>
                      {category.percentage.toFixed(1)}%
                    </div>
                    <div className='text-sm text-muted-foreground'>
                      of total staff
                    </div>
                  </div>
                </div>
              ))}

              {data.length > 5 && (
                <div className='text-center text-sm text-muted-foreground pt-4 border-t'>
                  And {data.length - 5} more categories
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
