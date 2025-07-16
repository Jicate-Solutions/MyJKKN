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
import { MapPin, Users, Globe } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { StaffGeographicStats } from '@/types/staff';

interface GeographicDistributionProps {
  data?: StaffGeographicStats;
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
            <span className='text-sm text-muted-foreground'>Staff Count:</span>
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

export function GeographicDistribution({
  data,
  isLoading
}: GeographicDistributionProps) {
  const stateChartData = useMemo(() => {
    if (!data?.stateDistribution) return [];

    return data.stateDistribution.map((item, index) => ({
      ...item,
      fill: COLORS[index % COLORS.length],
      uniqueKey: `state-${item.name}-${index}` // Ensure unique keys
    }));
  }, [data?.stateDistribution]);

  const districtChartData = useMemo(() => {
    if (!data?.districtDistribution) return [];

    return data.districtDistribution.slice(0, 10).map((item, index) => ({
      ...item,
      fill: COLORS[index % COLORS.length],
      uniqueKey: `district-${item.name}-${index}` // Ensure unique keys
    }));
  }, [data?.districtDistribution]);

  const topStates = useMemo(() => {
    if (!data?.stateDistribution) return [];
    return [...data.stateDistribution]
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [data?.stateDistribution]);

  const topDistricts = useMemo(() => {
    if (!data?.districtDistribution) return [];
    return [...data.districtDistribution]
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [data?.districtDistribution]);

  // Memoize the chart cell renderers to prevent recreation
  const renderStateCells = useCallback(() => {
    return stateChartData.map((entry, index) => (
      <Cell key={`state-bar-${entry.uniqueKey}`} fill={entry.fill} />
    ));
  }, [stateChartData]);

  const renderDistrictCells = useCallback(() => {
    return districtChartData.map((entry, index) => (
      <Cell key={`district-bar-${entry.uniqueKey}`} fill={entry.fill} />
    ));
  }, [districtChartData]);

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
            <MapPin className='h-5 w-5' />
            Geographic Distribution
          </CardTitle>
          <CardDescription>No data available</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex items-center justify-center h-[350px] text-muted-foreground'>
            <div className='text-center'>
              <Globe className='h-12 w-12 mx-auto mb-4 opacity-50' />
              <p>No geographic data available</p>
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
              <MapPin className='h-5 w-5' />
              Geographic Distribution
            </CardTitle>
            <CardDescription>
              Staff distribution by state and district
            </CardDescription>
          </div>
          <div className='flex items-center gap-2'>
            <Badge variant='outline'>
              {data.stateDistribution.length} States
            </Badge>
            <Badge variant='outline'>
              {data.districtDistribution.length} Districts
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue='states' className='space-y-4'>
          <TabsList>
            <TabsTrigger value='states'>States</TabsTrigger>
            <TabsTrigger value='districts'>Districts</TabsTrigger>
            <TabsTrigger value='top-regions'>Top Regions</TabsTrigger>
          </TabsList>

          <TabsContent value='states' className='space-y-4'>
            <div className='h-[350px]'>
              <ResponsiveContainer width='100%' height='100%'>
                <BarChart
                  data={stateChartData}
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
                  <Bar dataKey='count' radius={[4, 4, 0, 0]}>
                    {renderStateCells()}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value='districts' className='space-y-4'>
            <div className='h-[350px]'>
              <ResponsiveContainer width='100%' height='100%'>
                <BarChart
                  data={districtChartData}
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
                  <Bar dataKey='count' radius={[4, 4, 0, 0]}>
                    {renderDistrictCells()}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value='top-regions' className='space-y-6'>
            <div className='grid md:grid-cols-2 gap-6'>
              {/* Top States */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold flex items-center gap-2'>
                  <MapPin className='h-4 w-4' />
                  Top States
                </h3>
                <div className='space-y-3'>
                  {topStates.map((state, index) => (
                    <div
                      key={`state-top-${state.name}-${index}`}
                      className='flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors'
                    >
                      <div className='flex items-center gap-3'>
                        <div className='flex items-center justify-center w-6 h-6 bg-primary text-white rounded-full text-xs font-bold'>
                          {index + 1}
                        </div>
                        <div>
                          <h4 className='font-medium'>{state.name}</h4>
                          <div className='text-sm text-muted-foreground flex items-center gap-1'>
                            <Users className='h-3 w-3' />
                            {state.count.toLocaleString()} staff
                          </div>
                        </div>
                      </div>
                      <div className='text-right'>
                        <div className='text-lg font-bold'>
                          {state.percentage.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Districts */}
              <div className='space-y-4'>
                <h3 className='text-lg font-semibold flex items-center gap-2'>
                  <Globe className='h-4 w-4' />
                  Top Districts
                </h3>
                <div className='space-y-3'>
                  {topDistricts.map((district, index) => (
                    <div
                      key={`district-top-${district.name}-${index}`}
                      className='flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors'
                    >
                      <div className='flex items-center gap-3'>
                        <div className='flex items-center justify-center w-6 h-6 bg-secondary text-secondary-foreground rounded-full text-xs font-bold'>
                          {index + 1}
                        </div>
                        <div>
                          <h4 className='font-medium'>{district.name}</h4>
                          <div className='text-sm text-muted-foreground flex items-center gap-1'>
                            <Users className='h-3 w-3' />
                            {district.count.toLocaleString()} staff
                          </div>
                        </div>
                      </div>
                      <div className='text-right'>
                        <div className='text-lg font-bold'>
                          {district.percentage.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Summary Statistics */}
            <div className='grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t'>
              <div className='text-center p-3 bg-muted/50 rounded-lg'>
                <div className='text-2xl font-bold text-primary'>
                  {data.stateDistribution.length}
                </div>
                <div className='text-xs text-muted-foreground'>
                  Total States
                </div>
              </div>
              <div className='text-center p-3 bg-muted/50 rounded-lg'>
                <div className='text-2xl font-bold text-primary'>
                  {data.districtDistribution.length}
                </div>
                <div className='text-xs text-muted-foreground'>
                  Total Districts
                </div>
              </div>
              <div className='text-center p-3 bg-muted/50 rounded-lg'>
                <div className='text-2xl font-bold text-primary'>
                  {topStates[0]?.count || 0}
                </div>
                <div className='text-xs text-muted-foreground'>
                  Top State Count
                </div>
              </div>
              <div className='text-center p-3 bg-muted/50 rounded-lg'>
                <div className='text-2xl font-bold text-primary'>
                  {topDistricts[0]?.count || 0}
                </div>
                <div className='text-xs text-muted-foreground'>
                  Top District Count
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
