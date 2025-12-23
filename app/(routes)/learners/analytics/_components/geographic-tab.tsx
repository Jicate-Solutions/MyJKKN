// ============================================
// GEOGRAPHIC TAB - COMPREHENSIVE
// ============================================
// Created: 2025-01-23
// Purpose: Geographic distribution analysis by state and district
// Charts: Top states bar chart, top districts bar chart
// ============================================

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Map, Navigation } from 'lucide-react';
import type { LearnerDashboardStats, LearnerDashboardFilters, DistributionItem } from '@/types/learner-dashboard';
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

interface GeographicTabProps {
  data: LearnerDashboardStats;
  filters: LearnerDashboardFilters;
}

// Chart color palette
const CHART_COLORS = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#eab308', // yellow
  '#a855f7', // purple
  '#f97316', // orange
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#8b5cf6', // violet
  '#14b8a6', // teal
  '#f43f5e'  // rose
];

export function GeographicTab({ data, filters }: GeographicTabProps) {
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
              {payload[0].payload.percentage.toFixed(1)}%
            </Badge>
          </div>
        </div>
      );
    }
    return null;
  };

  // Calculate totals
  const totalByState = data.byState.reduce((sum, item) => sum + item.count, 0);
  const totalByDistrict = data.byDistrict.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total States</CardTitle>
            <Map className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.byState.length}</div>
            <p className="text-xs text-muted-foreground">
              {totalByState.toLocaleString()} learners across states
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Districts</CardTitle>
            <Navigation className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.byDistrict.length}</div>
            <p className="text-xs text-muted-foreground">
              {totalByDistrict.toLocaleString()} learners across districts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top State</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.byState.length > 0 ? data.byState[0].name : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground">
              {data.byState.length > 0 ? `${data.byState[0].count.toLocaleString()} learners` : 'No data'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* State Distribution */}
      {data.byState.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Map className="h-5 w-5 text-blue-600" />
              <CardTitle>State Distribution</CardTitle>
            </div>
            <CardDescription>
              Top 20 states by learner count ({data.byState.length} total states)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Show pie chart if 5 or fewer states, otherwise bar chart */}
            {data.byState.length <= 5 ? (
              <>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={data.byState}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ percent }) => (percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : '')}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="count"
                    >
                      {data.byState.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      formatter={(value, entry: any) => (
                        <span className="text-sm">
                          {value}: {entry.payload.count.toLocaleString()}
                        </span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={data.byState.slice(0, 20)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={150}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" radius={[0, 8, 8, 0]}>
                      {data.byState.slice(0, 20).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                {data.byState.length > 20 && (
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Showing top 20 of {data.byState.length} total states
                  </p>
                )}
              </>
            )}

            {/* State List */}
            <div className="mt-4 border-t pt-4">
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {data.byState.slice(0, 25).map((state, index) => (
                  <div key={state.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div
                        className="h-3 w-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                      />
                      <span className="truncate font-medium">{state.name}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-medium">{state.count.toLocaleString()}</span>
                      <Badge variant="secondary" className="text-xs">
                        {state.percentage.toFixed(1)}%
                      </Badge>
                    </div>
                  </div>
                ))}
                {data.byState.length > 25 && (
                  <p className="text-xs text-muted-foreground text-center pt-2">
                    + {data.byState.length - 25} more states
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* District Distribution */}
      {data.byDistrict.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Navigation className="h-5 w-5 text-green-600" />
              <CardTitle>District Distribution</CardTitle>
            </div>
            <CardDescription>
              Top 20 districts by learner count ({data.byDistrict.length} total districts)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={data.byDistrict.slice(0, 20)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={150}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" radius={[0, 8, 8, 0]}>
                  {data.byDistrict.slice(0, 20).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {data.byDistrict.length > 20 && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                Showing top 20 of {data.byDistrict.length} total districts
              </p>
            )}

            {/* District List */}
            <div className="mt-4 border-t pt-4">
              <div className="grid md:grid-cols-2 gap-3">
                {data.byDistrict.slice(0, 30).map((district, index) => (
                  <div
                    key={district.id}
                    className="flex items-center justify-between text-sm p-2 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div
                        className="h-3 w-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                      />
                      <span className="truncate font-medium">{district.name}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span>{district.count.toLocaleString()}</span>
                      <Badge variant="secondary" className="text-xs">
                        {district.percentage.toFixed(1)}%
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>

              {data.byDistrict.length > 30 && (
                <p className="text-xs text-muted-foreground text-center pt-3">
                  + {data.byDistrict.length - 30} more districts
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {data.byState.length === 0 && data.byDistrict.length === 0 && (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center text-muted-foreground">
              <MapPin className="mx-auto h-12 w-12 mb-2" />
              <p>No geographic data available</p>
              <p className="text-sm mt-2">
                Geographic information will appear here when learners have address data
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
