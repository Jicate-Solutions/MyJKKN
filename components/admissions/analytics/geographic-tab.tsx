'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { AdmissionDashboardAnalytics } from '@/types/admission';
import { MapPin } from 'lucide-react';

interface GeographicTabProps {
  data: AdmissionDashboardAnalytics['geographic'];
}

export function GeographicTab({ data }: GeographicTabProps) {
  return (
    <div className="space-y-6">
      {/* Top States */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            State Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={data.states}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="state" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="count" fill="#3b82f6" name="Applications" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* States Table */}
      <Card>
        <CardHeader>
          <CardTitle>Top States by Applications</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4">Rank</th>
                  <th className="text-left py-2 px-4">State</th>
                  <th className="text-right py-2 px-4">Applications</th>
                  <th className="text-left py-2 px-4">Distribution</th>
                </tr>
              </thead>
              <tbody>
                {data.states.map((state, index) => {
                  const total = data.states.reduce((sum, s) => sum + s.count, 0);
                  const percentage = (state.count / total) * 100;

                  return (
                    <tr key={state.state} className="border-b">
                      <td className="py-3 px-4">#{index + 1}</td>
                      <td className="py-3 px-4 font-medium">{state.state}</td>
                      <td className="text-right py-3 px-4">{state.count.toLocaleString()}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <span className="text-sm text-muted-foreground w-12">
                            {percentage.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Top Districts */}
      <Card>
        <CardHeader>
          <CardTitle>District Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={data.districts}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="district" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="count" fill="#8b5cf6" name="Applications" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Districts Table */}
      <Card>
        <CardHeader>
          <CardTitle>Top Districts by Applications</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4">Rank</th>
                  <th className="text-left py-2 px-4">District</th>
                  <th className="text-right py-2 px-4">Applications</th>
                  <th className="text-left py-2 px-4">Distribution</th>
                </tr>
              </thead>
              <tbody>
                {data.districts.map((district, index) => {
                  const total = data.districts.reduce((sum, d) => sum + d.count, 0);
                  const percentage = (district.count / total) * 100;

                  return (
                    <tr key={district.district} className="border-b">
                      <td className="py-3 px-4">#{index + 1}</td>
                      <td className="py-3 px-4 font-medium">{district.district}</td>
                      <td className="text-right py-3 px-4">{district.count.toLocaleString()}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-purple-600 h-2 rounded-full"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <span className="text-sm text-muted-foreground w-12">
                            {percentage.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
