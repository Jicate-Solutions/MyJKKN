'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { MapPin, Home, AlertCircle } from 'lucide-react';
import type { GeographyMetrics } from '@/types/learner-analytics';

interface AdvancedGeographyTabProps {
  data: GeographyMetrics;
}

const COLORS = {
  hostel: '#3B82F6',
  dayScholar: '#10B981',
};

export function AdvancedGeographyTab({ data }: AdvancedGeographyTabProps) {
  if (!data || data.districtContributions.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          No geography data available for the selected filters.
        </AlertDescription>
      </Alert>
    );
  }

  // Top 10 districts
  const topDistricts = data.districtContributions.slice(0, 10);

  // Top 15 taluks
  const topTaluks = data.talukContributions.slice(0, 15);

  // Accommodation data
  const accommodationData = [
    {
      name: 'Hostel',
      value: data.hostelStudentRatio,
      count: Math.round((data.hostelStudentRatio / 100) *
        data.districtContributions.reduce((sum, d) => sum + d.count, 0)),
      fill: COLORS.hostel,
    },
    {
      name: 'Day Scholar',
      value: data.dayScholarRatio,
      count: Math.round((data.dayScholarRatio / 100) *
        data.districtContributions.reduce((sum, d) => sum + d.count, 0)),
      fill: COLORS.dayScholar,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Home className="h-4 w-4" />
              Hostel Students
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <span className="text-2xl font-bold">{data.hostelStudentRatio.toFixed(1)}%</span>
              <p className="text-xs text-muted-foreground">
                {accommodationData[0].count.toLocaleString()} students
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Day Scholars
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <span className="text-2xl font-bold">{data.dayScholarRatio.toFixed(1)}%</span>
              <p className="text-xs text-muted-foreground">
                {accommodationData[1].count.toLocaleString()} students
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* District Contributions Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Top 10 Districts by Student Count</CardTitle>
          <CardDescription>
            Geographic distribution of learners by permanent address district
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={topDistricts} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis
                type="category"
                dataKey="district"
                width={120}
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-background border rounded-lg p-3 shadow-lg">
                        <p className="font-semibold">{data.district}</p>
                        <p className="text-sm">Students: {data.count.toLocaleString()}</p>
                        <p className="text-sm">
                          Contribution: {data.percentage.toFixed(1)}%
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="count" fill="#3B82F6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Taluk Contributions Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Top 15 Taluks by Student Count</CardTitle>
          <CardDescription>
            Detailed geographic distribution at taluk level
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={500}>
            <BarChart data={topTaluks} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis
                type="category"
                dataKey="taluk"
                width={120}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-background border rounded-lg p-3 shadow-lg">
                        <p className="font-semibold">{data.taluk}</p>
                        <p className="text-sm text-muted-foreground">{data.district} District</p>
                        <p className="text-sm">Students: {data.count.toLocaleString()}</p>
                        <p className="text-sm">
                          Contribution: {data.percentage.toFixed(1)}%
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="count" fill="#10B981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Accommodation Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Accommodation Type Distribution</CardTitle>
          <CardDescription>
            Hostel vs Day Scholar breakdown
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={accommodationData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {accommodationData.map((entry, index) => (
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
                        <p className="text-sm">Students: {data.count.toLocaleString()}</p>
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

      {/* Detailed District Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Districts</CardTitle>
          <CardDescription>
            Complete list of learners by district
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">#</th>
                  <th className="text-left p-2">District</th>
                  <th className="text-right p-2">Student Count</th>
                  <th className="text-right p-2">Contribution %</th>
                </tr>
              </thead>
              <tbody>
                {data.districtContributions.map((district, idx) => (
                  <tr key={idx} className="border-b hover:bg-muted/50">
                    <td className="p-2 text-muted-foreground">{idx + 1}</td>
                    <td className="p-2 font-medium">{district.district}</td>
                    <td className="text-right p-2">{district.count.toLocaleString()}</td>
                    <td className="text-right p-2">
                      <span className="font-semibold">{district.percentage.toFixed(1)}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
