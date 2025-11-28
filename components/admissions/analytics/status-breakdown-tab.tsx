'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
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
  Legend,
  ResponsiveContainer
} from 'recharts';
import { AdmissionDashboardAnalytics } from '@/types/admission';
import { ClipboardList, Users } from 'lucide-react';

interface StatusBreakdownTabProps {
  data: AdmissionDashboardAnalytics['statusBreakdown'];
}

// Admission status colors (pipeline stages)
const ADMISSION_STATUS_COLORS: Record<string, string> = {
  pending: '#eab308',
  approved: '#22c55e',
  rejected: '#ef4444',
  waitlisted: '#f97316',
  enrolled: '#a855f7'
};

// Student status colors (lifecycle stages)
const STUDENT_STATUS_COLORS: Record<string, string> = {
  active: '#22c55e',
  inactive: '#6b7280',
  graduated: '#3b82f6',
  dropped: '#ef4444',
  suspended: '#f97316'
};

// Custom label for pie chart
const renderCustomLabel = ({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent
}: any) => {
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
      className="text-xs font-bold"
    >
      {percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ''}
    </text>
  );
};

// Custom tooltip
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background border rounded-lg shadow-lg p-3">
        <p className="font-semibold capitalize">{payload[0].payload.status}</p>
        <p className="text-sm text-muted-foreground">
          Count: {payload[0].payload.count.toLocaleString()}
        </p>
        <p className="text-sm text-muted-foreground">
          Percentage: {payload[0].payload.percentage.toFixed(2)}%
        </p>
      </div>
    );
  }
  return null;
};

// Status table component
function StatusTable({
  data,
  colors,
  title
}: {
  data: { status: string; count: number; percentage: number }[];
  colors: Record<string, string>;
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-4 text-sm">Status</th>
                <th className="text-right py-2 px-4 text-sm">Count</th>
                <th className="text-right py-2 px-4 text-sm">%</th>
                <th className="text-left py-2 px-4 text-sm">Progress</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr key={item.status} className="border-b">
                  <td className="py-2 px-4">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{
                          backgroundColor: colors[item.status.toLowerCase()] || '#6b7280'
                        }}
                      />
                      <span className="font-medium capitalize text-sm">{item.status}</span>
                    </div>
                  </td>
                  <td className="text-right py-2 px-4 text-sm">{item.count.toLocaleString()}</td>
                  <td className="text-right py-2 px-4 text-sm">{item.percentage.toFixed(1)}%</td>
                  <td className="py-2 px-4">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{
                          width: `${Math.min(item.percentage, 100)}%`,
                          backgroundColor: colors[item.status.toLowerCase()] || '#6b7280'
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// Pie chart component
function StatusPieChart({
  data,
  colors,
  title
}: {
  data: { status: string; count: number; percentage: number }[];
  colors: Record<string, string>;
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={renderCustomLabel}
              outerRadius={90}
              fill="#8884d8"
              dataKey="count"
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={colors[entry.status.toLowerCase()] || '#6b7280'}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="bottom"
              height={36}
              formatter={(value, entry: any) => (
                <span className="capitalize text-xs">{entry.payload.status}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// Bar chart component
function StatusBarChart({
  data,
  colors,
  title
}: {
  data: { status: string; count: number; percentage: number }[];
  colors: Record<string, string>;
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart
            data={data}
            margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="status"
              angle={-45}
              textAnchor="end"
              height={80}
              interval={0}
              tick={{ fontSize: 11 }}
              tickFormatter={(value) => value.charAt(0).toUpperCase() + value.slice(1)}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              label={{ value: 'Count', angle: -90, position: 'insideLeft', fontSize: 11 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="count" radius={[8, 8, 0, 0]}>
              {data.map((entry, index) => (
                <Cell
                  key={`bar-cell-${index}`}
                  fill={colors[entry.status.toLowerCase()] || '#6b7280'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function StatusBreakdownTab({ data }: StatusBreakdownTabProps) {
  const { admissionStatuses, studentStatuses, totalAdmissions, totalStudents } = data;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-purple-500" />
              <CardTitle className="text-lg">Admission Pipeline</CardTitle>
            </div>
            <CardDescription>
              Application statuses from pending to enrolled
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-3xl font-bold">{totalAdmissions.toLocaleString()}</span>
              <Badge variant="secondary">Total Applications</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-500" />
              <CardTitle className="text-lg">Student Lifecycle</CardTitle>
            </div>
            <CardDescription>
              Student statuses from active to graduated
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-3xl font-bold">{totalStudents.toLocaleString()}</span>
              <Badge variant="secondary">Total Students</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabbed View for Admission vs Student Status */}
      <Tabs defaultValue="combined" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="combined">Combined View</TabsTrigger>
          <TabsTrigger value="admissions">Admissions Only</TabsTrigger>
          <TabsTrigger value="students">Students Only</TabsTrigger>
        </TabsList>

        {/* Combined View */}
        <TabsContent value="combined" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <StatusPieChart
              data={admissionStatuses}
              colors={ADMISSION_STATUS_COLORS}
              title="Admission Status Distribution"
            />
            <StatusPieChart
              data={studentStatuses}
              colors={STUDENT_STATUS_COLORS}
              title="Student Status Distribution"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <StatusTable
              data={admissionStatuses}
              colors={ADMISSION_STATUS_COLORS}
              title="Admission Pipeline Breakdown"
            />
            <StatusTable
              data={studentStatuses}
              colors={STUDENT_STATUS_COLORS}
              title="Student Lifecycle Breakdown"
            />
          </div>
        </TabsContent>

        {/* Admissions Only View */}
        <TabsContent value="admissions" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <StatusPieChart
              data={admissionStatuses}
              colors={ADMISSION_STATUS_COLORS}
              title="Status Distribution"
            />
            <StatusBarChart
              data={admissionStatuses}
              colors={ADMISSION_STATUS_COLORS}
              title="Status Comparison"
            />
          </div>

          <StatusTable
            data={admissionStatuses}
            colors={ADMISSION_STATUS_COLORS}
            title="Detailed Admission Status Breakdown"
          />
        </TabsContent>

        {/* Students Only View */}
        <TabsContent value="students" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <StatusPieChart
              data={studentStatuses}
              colors={STUDENT_STATUS_COLORS}
              title="Status Distribution"
            />
            <StatusBarChart
              data={studentStatuses}
              colors={STUDENT_STATUS_COLORS}
              title="Status Comparison"
            />
          </div>

          <StatusTable
            data={studentStatuses}
            colors={STUDENT_STATUS_COLORS}
            title="Detailed Student Status Breakdown"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
