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
  ResponsiveContainer
} from 'recharts';
import { AdmissionDashboardAnalytics } from '@/types/admission';
import { UserCheck } from 'lucide-react';

interface ReferenceSourcesTabProps {
  data: AdmissionDashboardAnalytics['referenceSources'];
}

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#6366f1'];

export function ReferenceSourcesTab({ data }: ReferenceSourcesTabProps) {
  return (
    <div className="space-y-6">
      {/* Reference Sources Pie Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5" />
              Reference Source Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ type, percentage }) =>
                    `${type}: ${percentage.toFixed(1)}%`
                  }
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reference Source Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.map((source, index) => (
                <div key={source.type} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="text-sm font-medium">{source.type}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-medium">{source.count}</span>
                      <span className="text-sm text-muted-foreground w-12 text-right">
                        {source.percentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{
                        width: `${source.percentage}%`,
                        backgroundColor: COLORS[index % COLORS.length]
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reference Sources Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Reference Sources Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="type" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="count" fill="#3b82f6" name="Applications" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Reference Sources Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Reference Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4">Rank</th>
                  <th className="text-left py-2 px-4">Reference Type</th>
                  <th className="text-right py-2 px-4">Count</th>
                  <th className="text-right py-2 px-4">Percentage</th>
                  <th className="text-left py-2 px-4">Visual</th>
                </tr>
              </thead>
              <tbody>
                {data.map((source, index) => (
                  <tr key={source.type} className="border-b">
                    <td className="py-3 px-4">#{index + 1}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        <span className="font-medium">{source.type}</span>
                      </div>
                    </td>
                    <td className="text-right py-3 px-4">{source.count.toLocaleString()}</td>
                    <td className="text-right py-3 px-4">{source.percentage.toFixed(2)}%</td>
                    <td className="py-3 px-4">
                      <div className="w-full bg-gray-200 rounded-full h-2 max-w-[200px]">
                        <div
                          className="h-2 rounded-full transition-all"
                          style={{
                            width: `${source.percentage}%`,
                            backgroundColor: COLORS[index % COLORS.length]
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
