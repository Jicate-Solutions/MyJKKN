'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { AdmissionDashboardAnalytics } from '@/types/admission';
import { TrendingUp, Calendar } from 'lucide-react';

interface TimeTrendsTabProps {
  data: AdmissionDashboardAnalytics['timeTrends'];
}

export function TimeTrendsTab({ data }: TimeTrendsTabProps) {
  return (
    <div className="space-y-6">
      {/* Daily Trends */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Daily Application Trends
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={data.daily}>
              <defs>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorApproved" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorRejected" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={(value) => new Date(value).toLocaleDateString()}
              />
              <YAxis />
              <Tooltip
                labelFormatter={(value) => new Date(value as string).toLocaleDateString()}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="count"
                stroke="#3b82f6"
                fillOpacity={1}
                fill="url(#colorTotal)"
                name="Total Applications"
              />
              <Area
                type="monotone"
                dataKey="approved"
                stroke="#22c55e"
                fillOpacity={1}
                fill="url(#colorApproved)"
                name="Approved"
              />
              <Area
                type="monotone"
                dataKey="rejected"
                stroke="#ef4444"
                fillOpacity={1}
                fill="url(#colorRejected)"
                name="Rejected"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Monthly Trends */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Monthly Application Volume
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.monthly}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="count" fill="#8b5cf6" name="Applications" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Peak Periods */}
      <Card>
        <CardHeader>
          <CardTitle>Peak Application Periods</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.peakPeriods}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="count" fill="#ec4899" name="Applications" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Trend Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Trend Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <h4 className="font-semibold text-sm text-muted-foreground">Daily Average</h4>
              <p className="text-2xl font-bold">
                {data.daily.length > 0
                  ? (
                      data.daily.reduce((sum, day) => sum + day.count, 0) /
                      data.daily.length
                    ).toFixed(1)
                  : 0}
              </p>
              <p className="text-xs text-muted-foreground">applications per day</p>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-sm text-muted-foreground">
                Highest Month
              </h4>
              <p className="text-2xl font-bold">
                {data.monthly.length > 0
                  ? data.monthly.reduce((max, month) =>
                      month.count > max.count ? month : max
                    ).month
                  : 'N/A'}
              </p>
              <p className="text-xs text-muted-foreground">
                {data.monthly.length > 0
                  ? `${data.monthly.reduce((max, month) => (month.count > max.count ? month : max)).count} applications`
                  : ''}
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-sm text-muted-foreground">Peak Period</h4>
              <p className="text-2xl font-bold">
                {data.peakPeriods.length > 0 ? data.peakPeriods[0].period : 'N/A'}
              </p>
              <p className="text-xs text-muted-foreground">
                {data.peakPeriods.length > 0
                  ? `${data.peakPeriods[0].count} applications`
                  : ''}
              </p>
            </div>
          </div>

          {/* Detailed Stats */}
          <div className="mt-6 space-y-2">
            <h4 className="font-semibold mb-3">Recent Activity (Last 7 Days)</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Applications:</span>
                <span className="font-medium">
                  {data.daily
                    .slice(-7)
                    .reduce((sum, day) => sum + day.count, 0)
                    .toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Daily Average:</span>
                <span className="font-medium">
                  {(
                    data.daily.slice(-7).reduce((sum, day) => sum + day.count, 0) /
                    Math.min(7, data.daily.slice(-7).length)
                  ).toFixed(1)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Approved:</span>
                <span className="font-medium text-green-600">
                  {data.daily
                    .slice(-7)
                    .reduce((sum, day) => sum + day.approved, 0)
                    .toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Rejected:</span>
                <span className="font-medium text-red-600">
                  {data.daily
                    .slice(-7)
                    .reduce((sum, day) => sum + day.rejected, 0)
                    .toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
