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
  Treemap
} from 'recharts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface GeographicDistributionProps {
  data?: Array<{
    state: string;
    district: string;
    count: number;
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

export function GeographicDistribution({
  data,
  isLoading
}: GeographicDistributionProps) {
  const { stateData, districtData } = useMemo(() => {
    if (!data) return { stateData: [], districtData: [] };

    // Group by state
    const stateMap = new Map();
    data.forEach((item) => {
      const state = item.state;
      if (!stateMap.has(state)) {
        stateMap.set(state, { state, count: 0, districts: [] });
      }
      stateMap.get(state).count += item.count;
      stateMap.get(state).districts.push({
        district: item.district,
        count: item.count,
        percentage: item.percentage
      });
    });

    const totalStudents = data.reduce((sum, item) => sum + item.count, 0);

    const stateData = Array.from(stateMap.values())
      .map((state, index) => ({
        ...state,
        percentage: totalStudents > 0 ? (state.count / totalStudents) * 100 : 0,
        fill: COLORS[index % COLORS.length]
      }))
      .sort((a, b) => b.count - a.count);

    const districtData = data
      .map((item, index) => ({
        ...item,
        name: `${item.district}, ${item.state}`,
        value: item.count,
        fill: COLORS[index % COLORS.length]
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15); // Top 15 districts

    return { stateData, districtData };
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
            <MapPin className='h-5 w-5' />
            Geographic Distribution
          </CardTitle>
          <CardDescription>No geographic data available</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex items-center justify-center h-[300px] text-muted-foreground'>
            <div className='text-center'>
              <MapPin className='h-12 w-12 mx-auto mb-4 opacity-50' />
              <p>No data to display</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const StateTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className='bg-background border rounded-lg shadow-lg p-3'>
          <p className='font-medium'>{data.state}</p>
          <div className='space-y-1 mt-2'>
            <div className='flex items-center justify-between gap-4'>
              <span className='text-sm text-muted-foreground'>Students:</span>
              <span className='font-medium'>{data.count.toLocaleString()}</span>
            </div>
            <div className='flex items-center justify-between gap-4'>
              <span className='text-sm text-muted-foreground'>Percentage:</span>
              <span className='font-medium'>{data.percentage.toFixed(1)}%</span>
            </div>
            <div className='flex items-center justify-between gap-4'>
              <span className='text-sm text-muted-foreground'>Districts:</span>
              <span className='font-medium'>{data.districts.length}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const DistrictTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className='bg-background border rounded-lg shadow-lg p-3'>
          <p className='font-medium'>{data.name}</p>
          <div className='space-y-1 mt-2'>
            <div className='flex items-center justify-between gap-4'>
              <span className='text-sm text-muted-foreground'>Students:</span>
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

  return (
    <Card>
      <CardHeader>
        <div className='flex items-center justify-between'>
          <div>
            <CardTitle className='flex items-center gap-2'>
              <MapPin className='h-5 w-5' />
              Geographic Distribution
            </CardTitle>
            <CardDescription>
              Student distribution by state and district
            </CardDescription>
          </div>
          <Badge variant='outline' className='text-sm'>
            {stateData.length} states, {data.length} districts
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue='states' className='w-full'>
          <TabsList className='grid w-full grid-cols-2'>
            <TabsTrigger value='states'>By States</TabsTrigger>
            <TabsTrigger value='districts'>By Districts</TabsTrigger>
          </TabsList>

          <TabsContent value='states' className='mt-4'>
            <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
              {/* State Bar Chart */}
              <div>
                <h4 className='font-medium mb-4'>State Distribution</h4>
                <div className='h-[300px]'>
                  <ResponsiveContainer width='100%' height='100%'>
                    <BarChart
                      data={stateData}
                      margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                    >
                      <CartesianGrid
                        strokeDasharray='3 3'
                        className='opacity-30'
                      />
                      <XAxis
                        dataKey='state'
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
                      <Tooltip content={<StateTooltip />} />
                      <Bar
                        dataKey='count'
                        name='Students'
                        radius={[4, 4, 0, 0]}
                      >
                        {stateData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* State Pie Chart */}
              <div>
                <h4 className='font-medium mb-4'>State Percentage</h4>
                <div className='h-[300px]'>
                  <ResponsiveContainer width='100%' height='100%'>
                    <PieChart>
                      <Pie
                        data={stateData}
                        cx='50%'
                        cy='50%'
                        labelLine={false}
                        label={({ state, percentage }) =>
                          percentage > 5
                            ? `${state}: ${percentage.toFixed(1)}%`
                            : ''
                        }
                        outerRadius={80}
                        fill='#8884d8'
                        dataKey='count'
                      >
                        {stateData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip content={<StateTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value='districts' className='mt-4'>
            <div>
              <h4 className='font-medium mb-4'>Top Districts</h4>
              <div className='h-[400px]'>
                <ResponsiveContainer width='100%' height='100%'>
                  <BarChart
                    data={districtData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 100 }}
                    layout='horizontal'
                  >
                    <CartesianGrid
                      strokeDasharray='3 3'
                      className='opacity-30'
                    />
                    <XAxis type='number' />
                    <YAxis
                      type='category'
                      dataKey='name'
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={180}
                    />
                    <Tooltip content={<DistrictTooltip />} />
                    <Bar
                      dataKey='count'
                      name='Students'
                      radius={[0, 4, 4, 0]}
                      fill='#3b82f6'
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Summary Stats */}
        <div className='mt-6 grid grid-cols-2 md:grid-cols-4 gap-4'>
          <div className='text-center p-3 border rounded-lg'>
            <div className='text-2xl font-bold text-blue-600'>
              {stateData.length}
            </div>
            <div className='text-sm text-muted-foreground'>States</div>
          </div>
          <div className='text-center p-3 border rounded-lg'>
            <div className='text-2xl font-bold text-green-600'>
              {data.length}
            </div>
            <div className='text-sm text-muted-foreground'>Districts</div>
          </div>
          <div className='text-center p-3 border rounded-lg'>
            <div className='text-2xl font-bold text-purple-600'>
              {stateData[0]?.state || 'N/A'}
            </div>
            <div className='text-sm text-muted-foreground'>Top State</div>
          </div>
          <div className='text-center p-3 border rounded-lg'>
            <div className='text-2xl font-bold text-orange-600'>
              {districtData[0]?.district || 'N/A'}
            </div>
            <div className='text-sm text-muted-foreground'>Top District</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
