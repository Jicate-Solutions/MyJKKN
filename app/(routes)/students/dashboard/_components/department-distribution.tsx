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
  Cell
} from 'recharts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BookOpen } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface DepartmentDistributionProps {
  data?: Array<{
    id: string;
    name: string;
    studentCount: number;
    percentage: number;
    institutionName: string;
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

export function DepartmentDistribution({
  data,
  isLoading
}: DepartmentDistributionProps) {
  const chartData = useMemo(() => {
    if (!data) return [];

    return data.map((item, index) => ({
      ...item,
      displayName:
        item.name.length > 15 ? item.name.substring(0, 15) + '...' : item.name,
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
          <Skeleton className='h-[300px] w-full' />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <BookOpen className='h-5 w-5' />
            Department Distribution
          </CardTitle>
          <CardDescription>No department data available</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex items-center justify-center h-[300px] text-muted-foreground'>
            <div className='text-center'>
              <BookOpen className='h-12 w-12 mx-auto mb-4 opacity-50' />
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
          <p className='text-sm text-muted-foreground'>
            {data.institutionName}
          </p>
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
              <BookOpen className='h-5 w-5' />
              Department Distribution
            </CardTitle>
            <CardDescription>
              Student enrollment across departments
            </CardDescription>
          </div>
          <Badge variant='outline' className='text-sm'>
            {data.length} departments
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue='bar' className='w-full'>
          <TabsList className='grid w-full grid-cols-2'>
            <TabsTrigger value='bar'>Bar Chart</TabsTrigger>
            <TabsTrigger value='pie'>Pie Chart</TabsTrigger>
          </TabsList>

          <TabsContent value='bar' className='mt-4'>
            <div className='h-[300px]'>
              <ResponsiveContainer width='100%' height='100%'>
                <BarChart
                  data={chartData}
                  margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray='3 3' className='opacity-30' />
                  <XAxis
                    dataKey='displayName'
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
                    dataKey='studentCount'
                    name='Students'
                    radius={[4, 4, 0, 0]}
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value='pie' className='mt-4'>
            <div className='h-[300px]'>
              <ResponsiveContainer width='100%' height='100%'>
                <PieChart>
                  <Pie
                    data={chartData}
                    cx='50%'
                    cy='50%'
                    labelLine={false}
                    outerRadius={80}
                    fill='#8884d8'
                    dataKey='studentCount'
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
        </Tabs>

        {/* Department List */}
        <div className='mt-6 space-y-2'>
          <h4 className='font-medium text-sm text-muted-foreground'>
            Top Departments
          </h4>
          <div className='space-y-2 max-h-40 overflow-y-auto'>
            {chartData
              .sort((a, b) => b.studentCount - a.studentCount)
              .slice(0, 5)
              .map((department) => (
                <div
                  key={department.id}
                  className='flex items-center justify-between p-2 border rounded-lg'
                >
                  <div className='flex items-center gap-3'>
                    <div
                      className='w-3 h-3 rounded-full'
                      style={{ backgroundColor: department.fill }}
                    />
                    <div>
                      <p className='font-medium text-sm'>
                        {department.fullName}
                      </p>
                      <p className='text-xs text-muted-foreground'>
                        {department.institutionName}
                      </p>
                    </div>
                  </div>
                  <div className='text-right'>
                    <div className='font-semibold'>
                      {department.studentCount.toLocaleString()}
                    </div>
                    <div className='text-xs text-muted-foreground'>
                      {department.percentage.toFixed(1)}%
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
