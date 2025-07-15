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
import { Building, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface InstitutionDistributionProps {
  data?: Array<{
    id: string;
    name: string;
    studentCount: number;
    percentage: number;
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

export function InstitutionDistribution({
  data,
  isLoading
}: InstitutionDistributionProps) {
  const chartData = useMemo(() => {
    if (!data) return [];

    return data.map((item, index) => ({
      ...item,
      displayName:
        item.name.length > 20 ? item.name.substring(0, 20) + '...' : item.name,
      fullName: item.name,
      fill: COLORS[index % COLORS.length]
    }));
  }, [data]);

  const summary = useMemo(() => {
    if (!data || data.length === 0) return null;

    const totalStudents = data.reduce(
      (sum, item) => sum + item.studentCount,
      0
    );
    const avgStudentsPerInstitution = Math.round(totalStudents / data.length);
    const maxInstitution = data.reduce(
      (max, item) => (item.studentCount > max.studentCount ? item : max),
      data[0]
    );
    const minInstitution = data.reduce(
      (min, item) => (item.studentCount < min.studentCount ? item : min),
      data[0]
    );

    return {
      totalInstitutions: data.length,
      totalStudents,
      avgStudentsPerInstitution,
      maxInstitution,
      minInstitution
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
          <div className='space-y-4'>
            <div className='flex gap-4'>
              <Skeleton className='h-8 w-20' />
              <Skeleton className='h-8 w-20' />
            </div>
            <Skeleton className='h-[300px] w-full' />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Building className='h-5 w-5' />
            Institution Distribution
          </CardTitle>
          <CardDescription>No institution data available</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex items-center justify-center h-[300px] text-muted-foreground'>
            <div className='text-center'>
              <Building className='h-12 w-12 mx-auto mb-4 opacity-50' />
              <p>No data to display</p>
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
          <p className='font-medium'>{data.fullName}</p>
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

  const PieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className='bg-background border rounded-lg shadow-lg p-3'>
          <p className='font-medium'>{data.fullName}</p>
          <div className='space-y-1 mt-2'>
            <div className='flex items-center justify-between gap-4'>
              <span className='text-sm text-muted-foreground'>Students:</span>
              <span className='font-medium'>
                {data.studentCount.toLocaleString()}
              </span>
            </div>
            <div className='flex items-center justify-between gap-4'>
              <span className='text-sm text-muted-foreground'>Share:</span>
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
              <Building className='h-5 w-5' />
              Institution Distribution
            </CardTitle>
            <CardDescription>
              Student enrollment across institutions
            </CardDescription>
          </div>
          {summary && (
            <Badge variant='outline' className='text-sm'>
              {summary.totalInstitutions} institutions
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {summary && (
          <div className='grid grid-cols-3 gap-4 mb-6'>
            <div className='text-center'>
              <div className='text-2xl font-bold text-blue-600'>
                {summary.totalStudents.toLocaleString()}
              </div>
              <div className='text-sm text-muted-foreground'>
                Total Students
              </div>
            </div>
            <div className='text-center'>
              <div className='text-2xl font-bold text-green-600'>
                {summary.avgStudentsPerInstitution.toLocaleString()}
              </div>
              <div className='text-sm text-muted-foreground'>
                Avg per Institution
              </div>
            </div>
            <div className='text-center'>
              <div className='text-2xl font-bold text-purple-600'>
                {summary.maxInstitution.studentCount.toLocaleString()}
              </div>
              <div className='text-sm text-muted-foreground'>Largest</div>
            </div>
          </div>
        )}

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
                  margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
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
                      <Cell
                        key={`bar-cell-${entry.id}-${index}`}
                        fill={entry.fill}
                      />
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
                    label={({ name, percentage }) =>
                      `${name}: ${percentage.toFixed(1)}%`
                    }
                    outerRadius={80}
                    fill='#8884d8'
                    dataKey='studentCount'
                  >
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`pie-cell-${entry.id}-${index}`}
                        fill={entry.fill}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
        </Tabs>

        {/* Institution List */}
        <div className='mt-6 space-y-2'>
          <h4 className='font-medium text-sm text-muted-foreground'>
            Institution Breakdown
          </h4>
          <div className='space-y-2 max-h-40 overflow-y-auto'>
            {chartData
              .sort((a, b) => b.studentCount - a.studentCount)
              .map((institution, index) => (
                <div
                  key={institution.id}
                  className='flex items-center justify-between p-2 border rounded-lg'
                >
                  <div className='flex items-center gap-3'>
                    <div
                      className='w-3 h-3 rounded-full'
                      style={{ backgroundColor: institution.fill }}
                    />
                    <div>
                      <p className='font-medium text-sm'>
                        {institution.fullName}
                      </p>
                      <p className='text-xs text-muted-foreground'>
                        {institution.percentage.toFixed(1)}% of total
                      </p>
                    </div>
                  </div>
                  <div className='text-right'>
                    <div className='font-semibold'>
                      {institution.studentCount.toLocaleString()}
                    </div>
                    <div className='text-xs text-muted-foreground'>
                      students
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
