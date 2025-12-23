// ============================================
// DEMOGRAPHICS TAB - COMPREHENSIVE
// ============================================
// Created: 2025-01-23
// Purpose: Demographic analysis (gender, age, religion, community, entry type, accommodation)
// Charts: Pie charts for gender/community, bar charts for religion/age/entry type
// ============================================

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, User, Calendar, Home, BookOpen, Heart } from 'lucide-react';
import type { LearnerDashboardStats, LearnerDashboardFilters, DistributionItem } from '@/types/learner-dashboard';
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

interface DemographicsTabProps {
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

// Gender-specific colors
const GENDER_COLORS: Record<string, string> = {
  'Male': '#3b82f6',
  'Female': '#ec4899',
  'Other': '#a855f7',
  'Not Specified': '#6b7280'
};

export function DemographicsTab({ data, filters }: DemographicsTabProps) {
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

  // Calculate totals for summary cards
  const totalByGender = data.byGender.reduce((sum, item) => sum + item.count, 0);
  const totalByReligion = data.byReligion.reduce((sum, item) => sum + item.count, 0);
  const totalByCommunity = data.byCommunity.reduce((sum, item) => sum + item.count, 0);
  const totalByAccommodation = data.byAccommodationType.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gender Categories</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.byGender.length}</div>
            <p className="text-xs text-muted-foreground">
              {totalByGender.toLocaleString()} total learners
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Religions</CardTitle>
            <Heart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.byReligion.length}</div>
            <p className="text-xs text-muted-foreground">
              {totalByReligion.toLocaleString()} total learners
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Communities</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.byCommunity.length}</div>
            <p className="text-xs text-muted-foreground">
              {totalByCommunity.toLocaleString()} total learners
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Accommodation Types</CardTitle>
            <Home className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.byAccommodationType.length}</div>
            <p className="text-xs text-muted-foreground">
              {totalByAccommodation.toLocaleString()} total learners
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Gender & Community Distribution Row */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Gender Distribution */}
        {data.byGender.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-600" />
                <CardTitle>Gender Distribution</CardTitle>
              </div>
              <CardDescription>
                Learner distribution by gender ({data.byGender.length} categories)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={data.byGender}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ percent }) => (percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : '')}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {data.byGender.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={GENDER_COLORS[entry.name] || CHART_COLORS[index % CHART_COLORS.length]}
                      />
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

              {/* Gender List */}
              <div className="mt-4 border-t pt-4 space-y-2">
                {data.byGender.map((gender, index) => (
                  <div key={gender.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{
                          backgroundColor: GENDER_COLORS[gender.name] || CHART_COLORS[index % CHART_COLORS.length]
                        }}
                      />
                      <span>{gender.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{gender.count.toLocaleString()}</span>
                      <Badge variant="secondary" className="text-xs">
                        {gender.percentage.toFixed(1)}%
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Community Distribution */}
        {data.byCommunity.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-purple-600" />
                <CardTitle>Community Distribution</CardTitle>
              </div>
              <CardDescription>
                Learner distribution by community ({data.byCommunity.length} categories)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={data.byCommunity.slice(0, 10)}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ percent }) => (percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : '')}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {data.byCommunity.slice(0, 10).map((entry, index) => (
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

              {data.byCommunity.length > 10 && (
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Showing top 10 of {data.byCommunity.length} total
                </p>
              )}

              {/* Community List */}
              <div className="mt-4 border-t pt-4 space-y-2 max-h-60 overflow-y-auto">
                {data.byCommunity.slice(0, 15).map((community, index) => (
                  <div key={community.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                      />
                      <span className="truncate">{community.name}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-medium">{community.count.toLocaleString()}</span>
                      <Badge variant="secondary" className="text-xs">
                        {community.percentage.toFixed(1)}%
                      </Badge>
                    </div>
                  </div>
                ))}
                {data.byCommunity.length > 15 && (
                  <p className="text-xs text-muted-foreground text-center pt-2">
                    + {data.byCommunity.length - 15} more communities
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Religion Distribution */}
      {data.byReligion.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-rose-600" />
              <CardTitle>Religion Distribution</CardTitle>
            </div>
            <CardDescription>
              Top religions by learner count ({data.byReligion.length} total)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.byReligion.slice(0, 10)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" radius={[0, 8, 8, 0]}>
                  {data.byReligion.slice(0, 10).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {data.byReligion.length > 10 && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                Showing top 10 of {data.byReligion.length} total religions
              </p>
            )}

            {/* Religion List */}
            <div className="mt-4 border-t pt-4">
              <div className="space-y-2">
                {data.byReligion.slice(0, 15).map((religion, index) => (
                  <div key={religion.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div
                        className="h-3 w-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                      />
                      <span className="truncate">{religion.name}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-medium">{religion.count.toLocaleString()}</span>
                      <Badge variant="secondary" className="text-xs">
                        {religion.percentage.toFixed(1)}%
                      </Badge>
                    </div>
                  </div>
                ))}
                {data.byReligion.length > 15 && (
                  <p className="text-xs text-muted-foreground text-center pt-2">
                    + {data.byReligion.length - 15} more religions
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Age & Entry Type Row */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Age Group Distribution */}
        {data.byAge.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-orange-600" />
                <CardTitle>Age Group Distribution</CardTitle>
              </div>
              <CardDescription>
                Learners by age group
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.byAge}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                    {data.byAge.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              {/* Age List */}
              <div className="mt-4 border-t pt-4 space-y-2">
                {data.byAge.map((age, index) => (
                  <div key={age.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                      />
                      <span>{age.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{age.count.toLocaleString()}</span>
                      <Badge variant="secondary" className="text-xs">
                        {age.percentage.toFixed(1)}%
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Entry Type Distribution */}
        {data.byEntryType.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-green-600" />
                <CardTitle>Entry Type Distribution</CardTitle>
              </div>
              <CardDescription>
                Learners by admission entry type
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.byEntryType}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                    {data.byEntryType.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              {/* Entry Type List */}
              <div className="mt-4 border-t pt-4 space-y-2">
                {data.byEntryType.map((entryType, index) => (
                  <div key={entryType.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                      />
                      <span>{entryType.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{entryType.count.toLocaleString()}</span>
                      <Badge variant="secondary" className="text-xs">
                        {entryType.percentage.toFixed(1)}%
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Accommodation Type Distribution */}
      {data.byAccommodationType.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Home className="h-5 w-5 text-cyan-600" />
              <CardTitle>Accommodation Type Distribution</CardTitle>
            </div>
            <CardDescription>
              Learners by accommodation type ({data.byAccommodationType.length} types)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={data.byAccommodationType}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ percent }) => (percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : '')}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {data.byAccommodationType.map((entry, index) => (
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

              {/* Accommodation Type List */}
              <div className="flex items-center">
                <div className="space-y-3 w-full">
                  {data.byAccommodationType.map((accommodation, index) => (
                    <div key={accommodation.id} className="flex items-center justify-between text-sm p-2 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                        />
                        <span className="font-medium">{accommodation.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span>{accommodation.count.toLocaleString()}</span>
                        <Badge variant="secondary" className="text-xs">
                          {accommodation.percentage.toFixed(1)}%
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
