// ============================================
// TRENDS TAB - COMPREHENSIVE
// ============================================
// Created: 2025-01-23
// Purpose: Time series analysis of enquiries, activations, graduations
// Charts: Area charts with gradient fills, combined multi-line chart
// ============================================

'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Calendar, Users, GraduationCap, UserPlus } from 'lucide-react';
import type { LearnerDashboardStats, LearnerDashboardFilters, TimeSeriesDataPoint } from '@/types/learner-dashboard';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { format, parseISO } from 'date-fns';

interface TrendsTabProps {
  data: LearnerDashboardStats;
  filters: LearnerDashboardFilters;
}

export function TrendsTab({ data, filters }: TrendsTabProps) {
  const [selectedView, setSelectedView] = useState<'all' | 'enquiries' | 'activations' | 'graduations'>('all');

  // Format data for charts
  const formatChartData = (data: TimeSeriesDataPoint[]) => {
    return data.map((point) => ({
      date: format(parseISO(point.date), 'MMM dd'),
      fullDate: format(parseISO(point.date), 'MMM dd, yyyy'),
      count: point.count
    }));
  };

  const enquiriesData = formatChartData(data.enquiriesByDate);
  const activationsData = formatChartData(data.activationsByDate);
  const graduationsData = formatChartData(data.graduationsByDate);

  // Combine all data for multi-line chart
  const combinedData = enquiriesData.map((point, index) => ({
    date: point.date,
    fullDate: point.fullDate,
    enquiries: point.count,
    activations: activationsData[index]?.count || 0,
    graduations: graduationsData[index]?.count || 0
  }));

  // Calculate totals and trends
  const totalEnquiries = enquiriesData.reduce((sum, point) => sum + point.count, 0);
  const totalActivations = activationsData.reduce((sum, point) => sum + point.count, 0);
  const totalGraduations = graduationsData.reduce((sum, point) => sum + point.count, 0);

  // Calculate average daily rates
  const avgDailyEnquiries = totalEnquiries / (enquiriesData.length || 1);
  const avgDailyActivations = totalActivations / (activationsData.length || 1);
  const avgDailyGraduations = totalGraduations / (graduationsData.length || 1);

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border rounded-lg shadow-lg p-3">
          <p className="font-semibold text-sm mb-2">{payload[0]?.payload?.fullDate}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              <div
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-muted-foreground">{entry.name}:</span>
              <span className="font-medium">{entry.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Enquiries Summary */}
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Enquiries</CardTitle>
            <UserPlus className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {totalEnquiries.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {avgDailyEnquiries.toFixed(1)} avg. per day
            </p>
            <div className="flex items-center gap-1 text-xs mt-2">
              {data.newEnquiries30Days.trend === 'up' ? (
                <>
                  <TrendingUp className="h-3 w-3 text-green-600" />
                  <span className="text-green-600">
                    +{data.newEnquiries30Days.change.toFixed(1)}%
                  </span>
                </>
              ) : (
                <>
                  <TrendingDown className="h-3 w-3 text-red-600" />
                  <span className="text-red-600">
                    {data.newEnquiries30Days.change.toFixed(1)}%
                  </span>
                </>
              )}
              <span className="text-muted-foreground">vs previous period</span>
            </div>
          </CardContent>
        </Card>

        {/* Activations Summary */}
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Activations</CardTitle>
            <Users className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {totalActivations.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {avgDailyActivations.toFixed(1)} avg. per day
            </p>
            <div className="flex items-center gap-1 text-xs mt-2">
              {data.activations30Days.trend === 'up' ? (
                <>
                  <TrendingUp className="h-3 w-3 text-green-600" />
                  <span className="text-green-600">
                    +{data.activations30Days.change.toFixed(1)}%
                  </span>
                </>
              ) : (
                <>
                  <TrendingDown className="h-3 w-3 text-red-600" />
                  <span className="text-red-600">
                    {data.activations30Days.change.toFixed(1)}%
                  </span>
                </>
              )}
              <span className="text-muted-foreground">vs previous period</span>
            </div>
          </CardContent>
        </Card>

        {/* Graduations Summary */}
        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Graduations</CardTitle>
            <GraduationCap className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {totalGraduations.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {avgDailyGraduations.toFixed(1)} avg. per day
            </p>
            <Badge variant="outline" className="mt-2 border-purple-500 text-purple-600">
              Over selected period
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Tabbed Charts */}
      <Tabs value={selectedView} onValueChange={(value: any) => setSelectedView(value)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">All Trends</TabsTrigger>
          <TabsTrigger value="enquiries">Enquiries</TabsTrigger>
          <TabsTrigger value="activations">Activations</TabsTrigger>
          <TabsTrigger value="graduations">Graduations</TabsTrigger>
        </TabsList>

        {/* Combined Trends */}
        <TabsContent value="all">
          <Card>
            <CardHeader>
              <CardTitle>Combined Trends</CardTitle>
              <CardDescription>
                Enquiries, activations, and graduations over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={combinedData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="enquiries"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                    name="Enquiries"
                  />
                  <Line
                    type="monotone"
                    dataKey="activations"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                    name="Activations"
                  />
                  <Line
                    type="monotone"
                    dataKey="graduations"
                    stroke="#a855f7"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                    name="Graduations"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Enquiries Trend */}
        <TabsContent value="enquiries">
          <Card>
            <CardHeader>
              <CardTitle>Enquiries Trend</CardTitle>
              <CardDescription>
                Daily enquiries over the selected period
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={enquiriesData}>
                  <defs>
                    <linearGradient id="colorEnquiries" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorEnquiries)"
                    name="Enquiries"
                  />
                </AreaChart>
              </ResponsiveContainer>

              {/* Stats */}
              <div className="mt-4 grid grid-cols-3 gap-4 border-t pt-4">
                <div>
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-xl font-bold">{totalEnquiries.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Daily Average</p>
                  <p className="text-xl font-bold">{avgDailyEnquiries.toFixed(1)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Peak Day</p>
                  <p className="text-xl font-bold">
                    {Math.max(...enquiriesData.map(d => d.count)).toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activations Trend */}
        <TabsContent value="activations">
          <Card>
            <CardHeader>
              <CardTitle>Activations Trend</CardTitle>
              <CardDescription>
                Daily activations (pending/approved → active) over the selected period
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={activationsData}>
                  <defs>
                    <linearGradient id="colorActivations" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#22c55e"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorActivations)"
                    name="Activations"
                  />
                </AreaChart>
              </ResponsiveContainer>

              {/* Stats */}
              <div className="mt-4 grid grid-cols-3 gap-4 border-t pt-4">
                <div>
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-xl font-bold">{totalActivations.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Daily Average</p>
                  <p className="text-xl font-bold">{avgDailyActivations.toFixed(1)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Peak Day</p>
                  <p className="text-xl font-bold">
                    {Math.max(...activationsData.map(d => d.count)).toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Graduations Trend */}
        <TabsContent value="graduations">
          <Card>
            <CardHeader>
              <CardTitle>Graduations Trend</CardTitle>
              <CardDescription>
                Daily graduations over the selected period
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={graduationsData}>
                  <defs>
                    <linearGradient id="colorGraduations" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#a855f7"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorGraduations)"
                    name="Graduations"
                  />
                </AreaChart>
              </ResponsiveContainer>

              {/* Stats */}
              <div className="mt-4 grid grid-cols-3 gap-4 border-t pt-4">
                <div>
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-xl font-bold">{totalGraduations.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Daily Average</p>
                  <p className="text-xl font-bold">{avgDailyGraduations.toFixed(1)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Peak Day</p>
                  <p className="text-xl font-bold">
                    {Math.max(...graduationsData.map(d => d.count)).toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Date Range Info */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>
              Data shown for:{' '}
              {filters.dateRange?.from && filters.dateRange?.to
                ? `${format(filters.dateRange.from, 'MMM dd, yyyy')} - ${format(filters.dateRange.to, 'MMM dd, yyyy')}`
                : 'All Time'}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
