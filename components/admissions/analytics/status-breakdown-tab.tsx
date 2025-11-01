'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  ResponsiveContainer,
  Label
} from 'recharts';
import { AdmissionDashboardAnalytics } from '@/types/admission';

interface StatusBreakdownTabProps {
  data: AdmissionDashboardAnalytics['statusBreakdown'];
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#eab308',
  approved: '#22c55e',
  rejected: '#ef4444',
  waitlisted: '#f97316',
  enrolled: '#a855f7'
};

// Custom label for pie chart
const renderCustomLabel = ({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
  status
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

export function StatusBreakdownTab({ data }: StatusBreakdownTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Pie Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Status Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomLabel}
                outerRadius={100}
                fill="#8884d8"
                dataKey="count"
              >
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={STATUS_COLORS[entry.status.toLowerCase()] || '#6b7280'}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                verticalAlign="bottom"
                height={36}
                formatter={(value, entry: any) => (
                  <span className="capitalize text-sm">{entry.payload.status}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Status Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
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
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => value.charAt(0).toUpperCase() + value.slice(1)}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                label={{ value: 'Count', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey="count"
                radius={[8, 8, 0, 0]}
              >
                {data.map((entry, index) => (
                  <Cell
                    key={`bar-cell-${index}`}
                    fill={STATUS_COLORS[entry.status.toLowerCase()] || '#6b7280'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Status Table */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Detailed Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4">Status</th>
                  <th className="text-right py-2 px-4">Count</th>
                  <th className="text-right py-2 px-4">Percentage</th>
                  <th className="text-left py-2 px-4">Progress</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item) => (
                  <tr key={item.status} className="border-b">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{
                            backgroundColor:
                              STATUS_COLORS[item.status.toLowerCase()] || '#6b7280'
                          }}
                        />
                        <span className="font-medium capitalize">{item.status}</span>
                      </div>
                    </td>
                    <td className="text-right py-3 px-4">{item.count.toLocaleString()}</td>
                    <td className="text-right py-3 px-4">{item.percentage.toFixed(2)}%</td>
                    <td className="py-3 px-4">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="h-2 rounded-full transition-all"
                          style={{
                            width: `${item.percentage}%`,
                            backgroundColor:
                              STATUS_COLORS[item.status.toLowerCase()] || '#6b7280'
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
    </div>
  );
}
