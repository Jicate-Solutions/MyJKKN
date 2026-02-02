'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
  Legend,
} from 'recharts';
import { Users, TrendingUp, DollarSign, GraduationCap, AlertCircle } from 'lucide-react';
import type { TrendMetrics } from '@/types/learner-analytics';

interface AdvancedTrendsTabProps {
  data: TrendMetrics;
}

const GENDER_COLORS = {
  male: '#3B82F6',
  female: '#EC4899',
  other: '#8B5CF6',
};

const CATEGORY_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
const COMMUNITY_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#6366F1'];

export function AdvancedTrendsTab({ data }: AdvancedTrendsTabProps) {
  if (!data) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          No trend data available for the selected filters.
        </AlertDescription>
      </Alert>
    );
  }

  // Prepare gender data
  const genderData = [
    {
      name: 'Male',
      value: data.genderRatio.malePercentage,
      count: data.genderRatio.male,
      fill: GENDER_COLORS.male,
    },
    {
      name: 'Female',
      value: data.genderRatio.femalePercentage,
      count: data.genderRatio.female,
      fill: GENDER_COLORS.female,
    },
  ];

  if (data.genderRatio.other && data.genderRatio.other > 0) {
    genderData.push({
      name: 'Other',
      value: ((data.genderRatio.other / (data.genderRatio.male + data.genderRatio.female + data.genderRatio.other)) * 100),
      count: data.genderRatio.other,
      fill: GENDER_COLORS.other,
    });
  }

  // Sort category and community data
  const sortedCategories = [...data.categoryMix].sort((a, b) => b.count - a.count);
  const sortedCommunities = [...data.communityMix].sort((a, b) => b.count - a.count);
  const sortedIncome = [...data.incomeDistribution].sort((a, b) => b.count - a.count);

  const totalLearners = data.genderRatio.male + data.genderRatio.female + (data.genderRatio.other || 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Total Learners
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <span className="text-2xl font-bold">{totalLearners.toLocaleString()}</span>
              <p className="text-xs text-muted-foreground">
                Across all filters
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <GraduationCap className="h-4 w-4" />
              First Generation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <span className="text-2xl font-bold">{data.firstGenerationPercentage.toFixed(1)}%</span>
              <p className="text-xs text-muted-foreground">
                {Math.round((data.firstGenerationPercentage / 100) * totalLearners).toLocaleString()} students
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Gender Ratio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <span className="text-2xl font-bold">
                {data.genderRatio.malePercentage.toFixed(0)}:{data.genderRatio.femalePercentage.toFixed(0)}
              </span>
              <p className="text-xs text-muted-foreground">
                Male:Female
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Income Bands
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <span className="text-2xl font-bold">{sortedIncome.length}</span>
              <p className="text-xs text-muted-foreground">
                Unique income ranges
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gender Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Gender Distribution</CardTitle>
            <CardDescription>
              Male, Female, and Other gender breakdown
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={genderData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {genderData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-background border rounded-lg p-3 shadow-lg">
                          <p className="font-semibold">{data.name}</p>
                          <p className="text-sm">Count: {data.count.toLocaleString()}</p>
                          <p className="text-sm">
                            Percentage: {data.value.toFixed(1)}%
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>First Generation Learners</CardTitle>
            <CardDescription>
              Students who are first in family to pursue higher education
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg bg-green-50 dark:bg-green-950/20">
                <div>
                  <p className="text-sm text-muted-foreground">First Generation</p>
                  <p className="text-2xl font-bold">
                    {Math.round((data.firstGenerationPercentage / 100) * totalLearners).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {data.firstGenerationPercentage.toFixed(1)}% of total
                  </p>
                </div>
                <GraduationCap className="h-8 w-8 text-green-600" />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Non-First Generation</p>
                  <p className="text-2xl font-bold">
                    {Math.round(((100 - data.firstGenerationPercentage) / 100) * totalLearners).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {(100 - data.firstGenerationPercentage).toFixed(1)}% of total
                  </p>
                </div>
                <Users className="h-8 w-8 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category Mix Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Category-wise Distribution</CardTitle>
          <CardDescription>
            SC, ST, OBC, General, and other categories
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={sortedCategories}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="category" />
              <YAxis />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-background border rounded-lg p-3 shadow-lg">
                        <p className="font-semibold">{data.category}</p>
                        <p className="text-sm">Students: {data.count.toLocaleString()}</p>
                        <p className="text-sm">
                          Percentage: {data.percentage.toFixed(1)}%
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                {sortedCategories.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Community Mix Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Community-wise Distribution</CardTitle>
          <CardDescription>
            Religious and community breakdown of learners
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={sortedCommunities}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="community" />
              <YAxis />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-background border rounded-lg p-3 shadow-lg">
                        <p className="font-semibold">{data.community}</p>
                        <p className="text-sm">Students: {data.count.toLocaleString()}</p>
                        <p className="text-sm">
                          Percentage: {data.percentage.toFixed(1)}%
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="count" fill="#10B981" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Income Distribution Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Annual Income Distribution</CardTitle>
          <CardDescription>
            Family annual income ranges of learners
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={sortedIncome}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="incomeBand" />
              <YAxis />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-background border rounded-lg p-3 shadow-lg">
                        <p className="font-semibold">Income: {data.incomeBand}</p>
                        <p className="text-sm">Students: {data.count.toLocaleString()}</p>
                        <p className="text-sm">
                          Percentage: {data.percentage.toFixed(1)}%
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="count" fill="#F59E0B" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Summary Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Category Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {sortedCategories.map((cat, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 border-b last:border-0">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded"
                      style={{ backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] }}
                    />
                    <span className="font-medium">{cat.category}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-semibold">{cat.count.toLocaleString()}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      ({cat.percentage.toFixed(1)}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Income Band Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {sortedIncome.map((income, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 border-b last:border-0">
                  <span className="font-medium">{income.incomeBand}</span>
                  <div className="text-right">
                    <span className="font-semibold">{income.count.toLocaleString()}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      ({income.percentage.toFixed(1)}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
