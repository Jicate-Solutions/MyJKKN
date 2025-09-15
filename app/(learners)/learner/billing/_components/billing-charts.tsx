'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Area,
  AreaChart,
  ComposedChart
} from 'recharts';
import {
  TrendingUp,
  PieChart as PieChartIcon,
  BarChart3,
  Activity,
  Calendar,
  Target
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { BillingChartData } from '@/types/learner-billing';

interface BillingChartsProps {
  charts: Record<string, BillingChartData>;
  loading?: boolean;
}

const COLORS = [
  '#0b6d41', // Brand Primary Green
  '#ffde59', // Brand Secondary Yellow
  '#10B981', // Emerald (for success states)
  '#EF4444', // Red (for errors/alerts)
  '#374151', // Gray (for neutral states)
  '#6B7280', // Light Gray
  '#059669', // Dark Green
  '#F59E0B'  // Amber (for warnings)
];

export function BillingCharts({ charts, loading = false }: BillingChartsProps) {
  if (loading) {
    return (
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
        {[...Array(4)].map((_, i) => (
          <Card key={i} className='animate-pulse'>
            <CardHeader>
              <div className='h-5 bg-gray-200 rounded w-1/3'></div>
            </CardHeader>
            <CardContent>
              <div className='h-80 bg-gray-100 rounded'></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className='bg-white p-3 shadow-lg rounded-lg border'>
          <p className='font-medium mb-2'>{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }} className='text-sm'>
              {`${entry.dataKey}: ${
                entry.dataKey.includes('amount') || entry.dataKey.includes('Amount')
                  ? formatCurrency(entry.value)
                  : entry.value
              }`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const renderPaymentStatusChart = () => {
    const chart = charts.paymentStatus;
    if (!chart) return null;

    const data = chart.data.labels?.map((label, index) => ({
      name: label,
      value: chart.data.datasets[0]?.data[index] || 0
    })) || [];

    return (
      <Card>
        <CardHeader className='flex flex-row items-center justify-between'>
          <div className='flex items-center gap-2'>
            <PieChartIcon className='h-5 w-5 text-[#0b6d41]' />
            <CardTitle className='text-lg'>Payment Status</CardTitle>
          </div>
          <Badge variant='outline'>Distribution</Badge>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width='100%' height={300}>
            <PieChart>
              <Pie
                data={data}
                cx='50%'
                cy='50%'
                innerRadius={60}
                outerRadius={120}
                paddingAngle={5}
                dataKey='value'
                label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: any) => [`${value} bills`, 'Count']} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  };

  const renderPaymentTrendChart = () => {
    const chart = charts.paymentTrend;
    if (!chart || !chart.data.datasets.length) return null;

    const data = chart.data.labels?.map((label, index) => ({
      month: label,
      billed: chart.data.datasets[0]?.data[index] || 0,
      paid: chart.data.datasets[1]?.data[index] || 0
    })) || [];

    return (
      <Card>
        <CardHeader className='flex flex-row items-center justify-between'>
          <div className='flex items-center gap-2'>
            <TrendingUp className='h-5 w-5 text-[#0b6d41]' />
            <CardTitle className='text-lg'>Payment Trends</CardTitle>
          </div>
          <Badge variant='outline'>Monthly</Badge>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width='100%' height={300}>
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray='3 3' />
              <XAxis
                dataKey='month'
                tick={{ fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}K`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Area
                type='monotone'
                dataKey='billed'
                stackId='1'
                stroke='#0b6d41'
                fill='#0b6d4140'
                name='Amount Billed'
              />
              <Area
                type='monotone'
                dataKey='paid'
                stackId='1'
                stroke='#ffde59'
                fill='#ffde5940'
                name='Amount Paid'
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  };

  const renderCategoryChart = () => {
    const chart = charts.categoryBreakdown;
    if (!chart) return null;

    const data = chart.data.labels?.map((label, index) => ({
      category: label,
      amount: chart.data.datasets[0]?.data[index] || 0
    })) || [];

    return (
      <Card>
        <CardHeader className='flex flex-row items-center justify-between'>
          <div className='flex items-center gap-2'>
            <BarChart3 className='h-5 w-5 text-[#0b6d41]' />
            <CardTitle className='text-lg'>Category Breakdown</CardTitle>
          </div>
          <Badge variant='outline'>Expenses</Badge>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width='100%' height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray='3 3' />
              <XAxis
                dataKey='category'
                tick={{ fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                angle={-45}
                textAnchor='end'
                height={60}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}K`}
              />
              <Tooltip
                formatter={(value: any) => [formatCurrency(value), 'Amount']}
                labelStyle={{ color: '#374151' }}
              />
              <Bar
                dataKey='amount'
                radius={[4, 4, 0, 0]}
                fill='url(#colorGradient)'
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
              <defs>
                <linearGradient id='colorGradient' x1='0' y1='0' x2='0' y2='1'>
                  <stop offset='5%' stopColor='#0b6d41' stopOpacity={0.8} />
                  <stop offset='95%' stopColor='#0b6d41' stopOpacity={0.2} />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  };

  const renderPaymentMethodsChart = () => {
    const chart = charts.paymentMethods;
    if (!chart) return null;

    const data = chart.data.labels?.map((label, index) => ({
      name: label,
      value: chart.data.datasets[0]?.data[index] || 0
    })) || [];

    return (
      <Card>
        <CardHeader className='flex flex-row items-center justify-between'>
          <div className='flex items-center gap-2'>
            <Activity className='h-5 w-5 text-[#0b6d41]' />
            <CardTitle className='text-lg'>Payment Methods</CardTitle>
          </div>
          <Badge variant='outline'>Usage</Badge>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width='100%' height={300}>
            <PieChart>
              <Pie
                data={data}
                cx='50%'
                cy='50%'
                outerRadius={120}
                dataKey='value'
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: any) => [`${value} times`, 'Used']} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  };

  const renderOutstandingChart = () => {
    const chart = charts.outstandingComparison;
    if (!chart || !chart.data.datasets.length) return null;

    const data = [{
      name: 'Financial Overview',
      totalBilled: chart.data.datasets[0]?.data[0] || 0,
      amountPaid: chart.data.datasets[0]?.data[1] || 0,
      outstanding: chart.data.datasets[0]?.data[2] || 0,
      paymentPercentage: chart.data.datasets[1]?.data[1] || 0
    }];

    return (
      <Card>
        <CardHeader className='flex flex-row items-center justify-between'>
          <div className='flex items-center gap-2'>
            <Target className='h-5 w-5 text-[#0b6d41]' />
            <CardTitle className='text-lg'>Payment Overview</CardTitle>
          </div>
          <Badge variant='outline'>Summary</Badge>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width='100%' height={300}>
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray='3 3' />
              <XAxis dataKey='name' hide />
              <YAxis
                yAxisId='amount'
                orientation='left'
                tick={{ fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}K`}
              />
              <YAxis
                yAxisId='percentage'
                orientation='right'
                tick={{ fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => `${value.toFixed(0)}%`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar
                yAxisId='amount'
                dataKey='totalBilled'
                name='Total Billed'
                fill='#0b6d41'
                radius={[4, 4, 0, 0]}
              />
              <Bar
                yAxisId='amount'
                dataKey='amountPaid'
                name='Amount Paid'
                fill='#ffde59'
                radius={[4, 4, 0, 0]}
              />
              <Bar
                yAxisId='amount'
                dataKey='outstanding'
                name='Outstanding'
                fill='#EF4444'
                radius={[4, 4, 0, 0]}
              />
              <Line
                yAxisId='percentage'
                type='monotone'
                dataKey='paymentPercentage'
                stroke='#374151'
                strokeWidth={3}
                name='Payment %'
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className='space-y-6'>
      <Tabs defaultValue='overview' className='w-full'>
        <TabsList className='grid w-full grid-cols-3'>
          <TabsTrigger value='overview'>Overview</TabsTrigger>
          <TabsTrigger value='trends'>Trends</TabsTrigger>
          <TabsTrigger value='breakdown'>Breakdown</TabsTrigger>
        </TabsList>

        <TabsContent value='overview' className='space-y-6'>
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
            {renderPaymentStatusChart()}
            {renderOutstandingChart()}
          </div>
        </TabsContent>

        <TabsContent value='trends' className='space-y-6'>
          <div className='grid grid-cols-1 gap-6'>
            {renderPaymentTrendChart()}
          </div>
        </TabsContent>

        <TabsContent value='breakdown' className='space-y-6'>
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
            {renderCategoryChart()}
            {renderPaymentMethodsChart()}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}