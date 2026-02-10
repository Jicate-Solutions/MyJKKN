'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  FileEdit,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Hourglass,
  Building2,
} from 'lucide-react';
import type { ChangeRequestAnalytics } from '@/types/learner-dashboard';

interface ChangeRequestsAnalyticsTabProps {
  data: ChangeRequestAnalytics;
}

const STATUS_COLORS: Record<string, string> = {
  Pending: '#F59E0B',
  Approved: '#10B981',
  Rejected: '#EF4444',
  Cancelled: '#6B7280',
};

export function ChangeRequestsAnalyticsTab({ data }: ChangeRequestsAnalyticsTabProps) {
  if (!data || data.totalRequests === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          No change requests found. Change request analytics will appear here once students submit profile edit requests.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <FileEdit className="h-5 w-5 text-blue-500" />
              <span className="text-2xl font-bold">{data.totalRequests.toLocaleString()}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              All time change requests
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending Review
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Hourglass className="h-5 w-5 text-amber-500" />
              <span className="text-2xl font-bold">{data.pendingCount.toLocaleString()}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Awaiting approval/rejection
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Approved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <span className="text-2xl font-bold">{data.approvedCount.toLocaleString()}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.approvalRate}% approval rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg. Review Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-indigo-500" />
              <span className="text-2xl font-bold">
                {data.averageReviewTimeHours < 24
                  ? `${data.averageReviewTimeHours}h`
                  : `${Math.round(data.averageReviewTimeHours / 24)}d`}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              From submission to review
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Status Distribution</CardTitle>
            <CardDescription>Breakdown of all change requests by status</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={data.byStatus}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={4}
                  dataKey="count"
                  nameKey="status"
                  label={({ status, percentage }) => `${status} ${percentage}%`}
                >
                  {data.byStatus.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={STATUS_COLORS[entry.status] || '#8884d8'}
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="bg-background border rounded-lg p-3 shadow-lg">
                          <p className="font-semibold">{d.status}</p>
                          <p className="text-sm">{d.count} requests ({d.percentage}%)</p>
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

        {/* Requests Trend (Last 30 Days) */}
        <Card>
          <CardHeader>
            <CardTitle>Request Trends</CardTitle>
            <CardDescription>Requests submitted over the last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={data.requestsByDate}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(val) => {
                    const d = new Date(val);
                    return `${d.getDate()}/${d.getMonth() + 1}`;
                  }}
                />
                <YAxis allowDecimals={false} />
                <Tooltip
                  labelFormatter={(label) => new Date(label).toLocaleDateString()}
                  formatter={(value: number) => [value, 'Requests']}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#6366F1"
                  fill="#6366F1"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Institution-Wise Breakdown */}
      {data.byInstitution.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Institution-Wise Breakdown
            </CardTitle>
            <CardDescription>
              Change request volume and approval rates per institution
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Institution</th>
                    <th className="text-right p-2">Total</th>
                    <th className="text-right p-2">Pending</th>
                    <th className="text-right p-2">Approved</th>
                    <th className="text-right p-2">Rejected</th>
                    <th className="text-right p-2">Approval Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byInstitution.map((inst) => (
                    <tr key={inst.institution_id} className="border-b hover:bg-muted/50">
                      <td className="p-2 font-medium">{inst.institution_name}</td>
                      <td className="text-right p-2">{inst.total}</td>
                      <td className="text-right p-2">
                        {inst.pending > 0 ? (
                          <Badge variant="outline" className="text-amber-600 border-amber-300">
                            {inst.pending}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="text-right p-2">
                        <span className="text-green-600">{inst.approved}</span>
                      </td>
                      <td className="text-right p-2">
                        <span className="text-red-600">{inst.rejected}</span>
                      </td>
                      <td className="text-right p-2">
                        <div className="flex items-center gap-2 justify-end">
                          <Progress
                            value={inst.approval_rate}
                            className="w-16 h-2"
                          />
                          <span className="text-xs font-semibold w-10 text-right">
                            {inst.approval_rate}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Changed Fields */}
      {data.topChangedFields.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Most Requested Field Changes</CardTitle>
            <CardDescription>
              Which profile fields students most commonly want to change
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(200, data.topChangedFields.length * 40)}>
              <BarChart data={data.topChangedFields} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis
                  type="category"
                  dataKey="field"
                  width={160}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(val: string) =>
                    val
                      .replace(/_/g, ' ')
                      .replace(/\b\w/g, (c) => c.toUpperCase())
                  }
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="bg-background border rounded-lg p-3 shadow-lg">
                          <p className="font-semibold">
                            {d.field.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                          </p>
                          <p className="text-sm">{d.count} requests ({d.percentage}%)</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="count" fill="#6366F1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
