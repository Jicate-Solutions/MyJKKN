'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { AdmissionDashboardAnalytics } from '@/types/admission';
import { GraduationCap } from 'lucide-react';

interface AcademicPerformanceTabProps {
  data: AdmissionDashboardAnalytics['academicPerformance'];
}

export function AcademicPerformanceTab({ data }: AcademicPerformanceTabProps) {
  // Average marks summary
  const averageMarks = [
    {
      exam: '10th Grade',
      average: data.averageMarks.tenth,
      color: '#3b82f6'
    },
    {
      exam: '12th Grade',
      average: data.averageMarks.twelfth,
      color: '#8b5cf6'
    }
  ];

  if (data.averageMarks.neet) {
    averageMarks.push({
      exam: 'NEET',
      average: data.averageMarks.neet,
      color: '#ec4899'
    });
  }

  return (
    <div className="space-y-6">
      {/* Average Marks Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {averageMarks.map((item) => (
          <Card key={item.exam}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{item.exam}</CardTitle>
              <GraduationCap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{item.average.toFixed(2)}%</div>
              <p className="text-xs text-muted-foreground">Average marks</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 10th Marks Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>10th Grade Marks Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.tenthMarksDistribution}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="range" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="count" fill="#3b82f6" name="Students" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 12th Marks Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>12th Grade Marks Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.twelfthMarksDistribution}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="range" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="count" fill="#8b5cf6" name="Students" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* NEET Score Distribution (if available) */}
      {data.neetScoreDistribution.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>NEET Score Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.neetScoreDistribution}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="range" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill="#ec4899" name="Students" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Comparative Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>Academic Performance Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-semibold mb-2">10th Grade Analysis</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Average:</span>
                    <span className="font-medium">{data.averageMarks.tenth.toFixed(2)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Students:</span>
                    <span className="font-medium">
                      {data.tenthMarksDistribution.reduce((sum, item) => sum + item.count, 0)}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">12th Grade Analysis</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Average:</span>
                    <span className="font-medium">{data.averageMarks.twelfth.toFixed(2)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Students:</span>
                    <span className="font-medium">
                      {data.twelfthMarksDistribution.reduce((sum, item) => sum + item.count, 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {data.averageMarks.neet && (
              <div>
                <h4 className="font-semibold mb-2">NEET Analysis</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Average Score:</span>
                    <span className="font-medium">{data.averageMarks.neet.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Students:</span>
                    <span className="font-medium">
                      {data.neetScoreDistribution.reduce((sum, item) => sum + item.count, 0)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
