// ============================================
// TRENDS TAB - COMBINED (Enhanced)
// ============================================
// Combined from: trends-tab.tsx + advanced-trends-tab.tsx
// Purpose: Complete trend analysis
// Features:
//   - Time series (from old tab): Enquiries, Activations, Graduations over time
//   - Demographics (from advanced tab): Gender, Category, Community, Income, First-gen
// ============================================

'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Users,
  GraduationCap,
  UserPlus,
  AlertCircle,
  PieChart as PieChartIcon,
  DollarSign
} from 'lucide-react';
import type { LearnerDashboardStats, LearnerDashboardFilters, TimeSeriesDataPoint } from '@/types/learner-dashboard';
import type { TrendMetrics } from '@/types/learner-analytics';
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
  Legend,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { format, parseISO } from 'date-fns';

interface TrendsTabCombinedProps {
  basicData: LearnerDashboardStats;
  advancedData?: TrendMetrics;
  filters: LearnerDashboardFilters;
}

const GENDER_COLORS = {
  male: '#3B82F6',
  female: '#EC4899',
  other: '#8B5CF6',
};

const CHART_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#6366F1', '#14b8a6'];

export function TrendsTabCombined({ basicData, advancedData, filters }: TrendsTabCombinedProps) {
  const [selectedView, setSelectedView] = useState<'timeseries' | 'demographics'>('timeseries');

  // Format data for time series charts
  const formatChartData = (data: TimeSeriesDataPoint[]) => {
    return data.map((point) => ({
      date: format(parseISO(point.date), 'MMM dd'),
      fullDate: format(parseISO(point.date), 'MMM dd, yyyy'),
      count: point.count
    }));
  };

  const enquiriesData = formatChartData(basicData.enquiriesByDate);
  const activationsData = formatChartData(basicData.activationsByDate);
  const graduationsData = formatChartData(basicData.graduationsByDate);

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

  // Prepare advanced data
  const genderData = advancedData ? [
    {
      name: 'Male',
      value: advancedData.genderRatio.malePercentage,
      count: advancedData.genderRatio.male,
      fill: GENDER_COLORS.male,
    },
    {
      name: 'Female',
      value: advancedData.genderRatio.femalePercentage,
      count: advancedData.genderRatio.female,
      fill: GENDER_COLORS.female,
    },
  ] : [];

  if (advancedData?.genderRatio.other && advancedData.genderRatio.other > 0) {
    const total = advancedData.genderRatio.male + advancedData.genderRatio.female + advancedData.genderRatio.other;
    genderData.push({
      name: 'Other',
      value: (advancedData.genderRatio.other / total) * 100,
      count: advancedData.genderRatio.other,
      fill: GENDER_COLORS.other,
    });
  }

  const sortedCategories = advancedData ? [...advancedData.categoryMix].sort((a, b) => b.count - a.count) : [];
  const sortedCommunities = advancedData ? [...advancedData.communityMix].sort((a, b) => b.count - a.count) : [];
  const sortedIncome = advancedData ? [...advancedData.incomeDistribution].sort((a, b) => b.count - a.count) : [];

  const totalAdvancedLearners = advancedData
    ? advancedData.genderRatio.male + advancedData.genderRatio.female + (advancedData.genderRatio.other || 0)
    : 0;

  // Custom tooltip for time series
  const TimeSeriesTooltip = ({ active, payload }: any) => {
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
              <span className="text-muted-foreground capitalize">{entry.name}:</span>
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Enquiries</CardTitle>
            <UserPlus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalEnquiries.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {enquiriesData.length} days tracked
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Activations</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalActivations.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {activationsData.length} days tracked
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Graduations</CardTitle>
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalGraduations.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {graduationsData.length} days tracked
            </p>
          </CardContent>
        </Card>

        {advancedData && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">First Generation</CardTitle>
              <GraduationCap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{advancedData.firstGenerationPercentage.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">
                {Math.round((advancedData.firstGenerationPercentage / 100) * basicData.totalCount).toLocaleString()} learners
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Tabbed Content */}
      <Tabs value={selectedView} onValueChange={(v) => setSelectedView(v as any)} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="timeseries">
            <TrendingUp className="h-4 w-4 mr-2" />
            Time Series
          </TabsTrigger>
          <TabsTrigger value="demographics" disabled={!advancedData}>
            <PieChartIcon className="h-4 w-4 mr-2" />
            Demographics
            {!advancedData && <Badge variant="secondary" className="ml-2 text-xs">No Data</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* Time Series View */}
        <TabsContent value="timeseries" className="space-y-6">
          {/* Combined Trends Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Combined Trends</CardTitle>
              <CardDescription>
                Enquiries, activations, and graduations over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={combinedData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 12 }}
                      angle={-45}
                      textAnchor="end"
                      height={70}
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip content={<TimeSeriesTooltip />} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="enquiries"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      name="Enquiries"
                    />
                    <Line
                      type="monotone"
                      dataKey="activations"
                      stroke="#22c55e"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      name="Activations"
                    />
                    <Line
                      type="monotone"
                      dataKey="graduations"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      name="Graduations"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Individual Trend Charts */}
          <div className="grid gap-6 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Enquiries Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={enquiriesData}>
                      <defs>
                        <linearGradient id="colorEnquiries" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="count"
                        stroke="#3b82f6"
                        fill="url(#colorEnquiries)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Activations Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={activationsData}>
                      <defs>
                        <linearGradient id="colorActivations" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="count"
                        stroke="#22c55e"
                        fill="url(#colorActivations)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Graduations Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={graduationsData}>
                      <defs>
                        <linearGradient id="colorGraduations" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="count"
                        stroke="#f59e0b"
                        fill="url(#colorGraduations)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Demographics View */}
        <TabsContent value="demographics" className="space-y-6">
          {advancedData ? (
            <>
              {/* Gender Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle>Gender Distribution</CardTitle>
                  <CardDescription>Male vs Female ratio</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={genderData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={(entry) => `${entry.name}: ${entry.value.toFixed(1)}%`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {genderData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Category Mix */}
              <Card>
                <CardHeader>
                  <CardTitle>Category Distribution</CardTitle>
                  <CardDescription>SC/ST/OBC/General breakdown</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={sortedCategories}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis dataKey="category" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Bar dataKey="count" fill="#3B82F6" radius={[8, 8, 0, 0]}>
                          {sortedCategories.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Income Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle>Income Distribution</CardTitle>
                  <CardDescription>Family annual income brackets</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={sortedIncome} layout="horizontal">
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis type="number" tick={{ fontSize: 12 }} />
                        <YAxis
                          type="category"
                          dataKey="incomeBracket"
                          tick={{ fontSize: 11 }}
                          width={120}
                        />
                        <Tooltip />
                        <Bar dataKey="count" fill="#10B981" radius={[0, 8, 8, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Advanced demographic data is not available. This may be because advanced analytics fields need to be populated in the database.
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
