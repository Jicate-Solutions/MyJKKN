'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Download, TrendingUp, PieChart, BarChart3, Calendar } from 'lucide-react';
import { Line, Bar, Doughnut, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
} from 'chart.js';
import type { AttendanceChartData } from '@/types/learner-attendance';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
);

interface AttendanceChartsProps {
  getChartData: (type: 'monthly' | 'course' | 'trend' | 'status') => AttendanceChartData | null;
  loading?: boolean;
}

export function AttendanceCharts({ getChartData, loading = false }: AttendanceChartsProps) {
  const renderChart = (chartData: AttendanceChartData | null) => {
    if (!chartData) {
      return (
        <div className='flex items-center justify-center h-64 text-gray-500'>
          <p>No data available</p>
        </div>
      );
    }

    const commonOptions = {
      responsive: true,
      maintainAspectRatio: false,
      ...chartData.options
    };

    switch (chartData.type) {
      case 'line':
        return <Line data={chartData.data} options={commonOptions} />;
      case 'bar':
        return <Bar data={chartData.data} options={commonOptions} />;
      case 'doughnut':
        return <Doughnut data={chartData.data} options={commonOptions} />;
      case 'pie':
        return <Pie data={chartData.data} options={commonOptions} />;
      case 'area':
        return <Line data={chartData.data} options={commonOptions} />;
      default:
        return <div>Unsupported chart type</div>;
    }
  };

  if (loading) {
    return (
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
        {[...Array(4)].map((_, i) => (
          <Card key={i} className='animate-pulse'>
            <CardHeader>
              <div className='h-4 bg-gray-200 rounded w-1/2'></div>
            </CardHeader>
            <CardContent>
              <div className='h-64 bg-gray-200 rounded'></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <h3 className='text-lg font-semibold'>Attendance Analytics</h3>
        <Button variant='outline' size='sm'>
          <Download className='h-4 w-4 mr-2' />
          Export Charts
        </Button>
      </div>

      <Tabs defaultValue='overview' className='space-y-6'>
        <TabsList className='grid w-full grid-cols-4'>
          <TabsTrigger value='overview' className='flex items-center gap-2'>
            <TrendingUp className='h-4 w-4' />
            Overview
          </TabsTrigger>
          <TabsTrigger value='trends' className='flex items-center gap-2'>
            <BarChart3 className='h-4 w-4' />
            Trends
          </TabsTrigger>
          <TabsTrigger value='courses' className='flex items-center gap-2'>
            <PieChart className='h-4 w-4' />
            Courses
          </TabsTrigger>
          <TabsTrigger value='calendar' className='flex items-center gap-2'>
            <Calendar className='h-4 w-4' />
            Status
          </TabsTrigger>
        </TabsList>

        <TabsContent value='overview' className='space-y-6'>
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
            {/* Monthly Attendance Trend */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <BarChart3 className='h-5 w-5' />
                  Monthly Attendance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className='h-64'>
                  {renderChart(getChartData('monthly'))}
                </div>
              </CardContent>
            </Card>

            {/* Attendance Status Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <PieChart className='h-5 w-5' />
                  Status Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className='h-64'>
                  {renderChart(getChartData('status'))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value='trends' className='space-y-6'>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <TrendingUp className='h-5 w-5' />
                Weekly Attendance Trend
              </CardTitle>
              <p className='text-sm text-muted-foreground'>
                Track your attendance performance over the last 12 weeks
              </p>
            </CardHeader>
            <CardContent>
              <div className='h-80'>
                {renderChart(getChartData('trend'))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value='courses' className='space-y-6'>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <PieChart className='h-5 w-5' />
                Course-wise Attendance
              </CardTitle>
              <p className='text-sm text-muted-foreground'>
                Compare attendance across all your enrolled courses
              </p>
            </CardHeader>
            <CardContent>
              <div className='h-80'>
                {renderChart(getChartData('course'))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value='calendar' className='space-y-6'>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <Calendar className='h-5 w-5' />
                Attendance Status Breakdown
              </CardTitle>
              <p className='text-sm text-muted-foreground'>
                Visual representation of your attendance status distribution
              </p>
            </CardHeader>
            <CardContent>
              <div className='h-80'>
                {renderChart(getChartData('status'))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}