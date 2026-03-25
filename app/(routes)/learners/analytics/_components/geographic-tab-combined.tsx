// ============================================
// GEOGRAPHIC TAB - COMBINED (Enhanced)
// ============================================
// Combined from: geographic-tab.tsx + advanced-geography-tab.tsx
// Purpose: Complete geographic distribution analysis
// Features:
//   - Basic View: State, District & Taluk distribution
//   - Advanced View: Accommodation statistics
// Updated: 2025-02-02 - Moved Taluks to basic view
// ============================================

'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MapPin, Map, Navigation, Home, AlertCircle, Globe } from 'lucide-react';
import type { LearnerDashboardStats, LearnerDashboardFilters } from '@/types/learner-dashboard';
import type { GeographyMetrics } from '@/types/learner-analytics';
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
  Legend
} from 'recharts';

interface GeographicTabCombinedProps {
  basicData: LearnerDashboardStats;
  advancedData?: GeographyMetrics;
  filters: LearnerDashboardFilters;
}

// Chart color palette
const CHART_COLORS = [
  '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316',
  '#06b6d4', '#ec4899', '#8b5cf6', '#14b8a6', '#f43f5e'
];

const ACCOMMODATION_COLORS = {
  hostel: '#3B82F6',
  dayScholar: '#10B981',
};

export function GeographicTabCombined({ basicData, advancedData, filters }: GeographicTabCombinedProps) {
  const [selectedView, setSelectedView] = useState<'basic' | 'advanced'>('basic');

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border rounded-lg shadow-lg p-3">
          <p className="font-semibold text-sm mb-1">{payload[0].payload.name}</p>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Count:</span>
            <span className="font-medium">{payload[0].value.toLocaleString()}</span>
            <Badge variant="secondary" className="text-xs">
              {payload[0].payload.percentage?.toFixed(1) || '0'}%
            </Badge>
          </div>
        </div>
      );
    }
    return null;
  };

  // Calculate totals from basic data
  const totalByState = basicData.byState.reduce((sum, item) => sum + item.count, 0);
  const totalByDistrict = basicData.byDistrict.reduce((sum, item) => sum + item.count, 0);

  // Prepare advanced data if available
  const topDistricts = advancedData?.districtContributions.slice(0, 10) || [];
  const topTaluks = advancedData?.talukContributions.slice(0, 15) || [];

  const accommodationData = advancedData ? [
    {
      name: 'Hostel',
      value: advancedData.hostelStudentRatio,
      count: Math.round((advancedData.hostelStudentRatio / 100) * (advancedData.districtContributions.reduce((sum, d) => sum + d.count, 0) || 1)),
      fill: ACCOMMODATION_COLORS.hostel,
    },
    {
      name: 'Day Scholar',
      value: advancedData.dayScholarRatio,
      count: Math.round((advancedData.dayScholarRatio / 100) * (advancedData.districtContributions.reduce((sum, d) => sum + d.count, 0) || 1)),
      fill: ACCOMMODATION_COLORS.dayScholar,
    },
  ] : [];

  return (
    <div className="space-y-6">
      {/* Summary Cards Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Basic Data Cards */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total States</CardTitle>
            <Map className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{basicData.byState.length}</div>
            <p className="text-xs text-muted-foreground">
              {totalByState.toLocaleString()} learners
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Districts</CardTitle>
            <Navigation className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{basicData.byDistrict.length}</div>
            <p className="text-xs text-muted-foreground">
              {totalByDistrict.toLocaleString()} learners
            </p>
          </CardContent>
        </Card>

        {/* Advanced Data Cards */}
        {advancedData && (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Hostel Students</CardTitle>
                <Home className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{advancedData.hostelStudentRatio.toFixed(1)}%</div>
                <p className="text-xs text-muted-foreground">
                  {accommodationData[0]?.count.toLocaleString()} students
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Day Scholars</CardTitle>
                <MapPin className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{advancedData.dayScholarRatio.toFixed(1)}%</div>
                <p className="text-xs text-muted-foreground">
                  {accommodationData[1]?.count.toLocaleString()} students
                </p>
              </CardContent>
            </Card>

          </>
        )}
      </div>

      {/* Tabbed Content */}
      <Tabs value={selectedView} onValueChange={(v) => setSelectedView(v as any)} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="basic">
            <Map className="h-4 w-4 mr-2" />
            Geographic Distribution
          </TabsTrigger>
          <TabsTrigger value="advanced" disabled={!advancedData}>
            <Globe className="h-4 w-4 mr-2" />
            Accommodation
            {!advancedData && <Badge variant="secondary" className="ml-2 text-xs">No Data</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* Basic View: States & Districts */}
        <TabsContent value="basic" className="space-y-6">
          {/* States Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Top 10 States by Learner Count</CardTitle>
              <CardDescription>
                Geographic distribution across states
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={basicData.byState.slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 12 }}
                      angle={-45}
                      textAnchor="end"
                      height={100}
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" fill="#3b82f6" radius={[8, 8, 0, 0]}>
                      {basicData.byState.slice(0, 10).map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Districts Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Top 15 Districts by Learner Count</CardTitle>
              <CardDescription>
                District-wise learner distribution
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[500px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={basicData.byDistrict.slice(0, 15)}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 12 }}
                      angle={-45}
                      textAnchor="end"
                      height={120}
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" fill="#22c55e" radius={[8, 8, 0, 0]}>
                      {basicData.byDistrict.slice(0, 15).map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Taluks Distribution - Now in Basic View */}
          {advancedData && topTaluks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Top 15 Taluks by Learner Count</CardTitle>
                <CardDescription>
                  Taluk-wise learner distribution
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[500px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topTaluks} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis type="number" tick={{ fontSize: 12 }} />
                      <YAxis
                        type="category"
                        dataKey="taluk"
                        tick={{ fontSize: 11 }}
                        width={120}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-background border rounded-lg shadow-lg p-3">
                                <p className="font-semibold text-sm mb-1">{payload[0].payload.taluk}</p>
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="text-muted-foreground">Students:</span>
                                  <span className="font-medium">{payload[0].value?.toLocaleString()}</span>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="count" fill="#F59E0B" radius={[0, 8, 8, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Advanced View: Detailed Analysis */}
        <TabsContent value="advanced" className="space-y-6">
          {advancedData ? (
            <>
              {/* Accommodation Statistics */}
              <Card>
                <CardHeader>
                  <CardTitle>Accommodation Type</CardTitle>
                  <CardDescription>Hostel vs Day Scholar distribution</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={accommodationData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={(entry) => `${entry.name}: ${entry.value.toFixed(1)}%`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {accommodationData.map((entry, index) => (
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
            </>
          ) : (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Advanced geography data is not available. This may be because advanced analytics fields need to be populated in the database.
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
