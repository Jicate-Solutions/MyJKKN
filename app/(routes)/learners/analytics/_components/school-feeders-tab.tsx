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
import { School, TrendingUp, Award, AlertCircle } from 'lucide-react';
import type { SchoolFeederMetrics } from '@/types/learner-analytics';

interface SchoolFeedersTabProps {
  data: SchoolFeederMetrics;
}

const SCHOOL_TYPE_COLORS: Record<string, string> = {
  government: '#10B981',
  aided: '#3B82F6',
  private: '#F59E0B',
  cbse: '#8B5CF6',
  icse: '#EC4899',
  state_board: '#6366F1',
};

const SCHOOL_TYPE_LABELS: Record<string, string> = {
  government: 'Government',
  aided: 'Aided',
  private: 'Private',
  cbse: 'CBSE',
  icse: 'ICSE',
  state_board: 'State Board',
};

export function SchoolFeedersTab({ data }: SchoolFeedersTabProps) {
  if (!data || data.schools.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          No school feeder data available for the selected filters.
        </AlertDescription>
      </Alert>
    );
  }

  // School type distribution
  const schoolTypeCounts = new Map<string, number>();
  const schoolTypeStudents = new Map<string, number>();

  data.schools.forEach(school => {
    const type = school.schoolType;
    schoolTypeCounts.set(type, (schoolTypeCounts.get(type) || 0) + 1);
    schoolTypeStudents.set(
      type,
      (schoolTypeStudents.get(type) || 0) + school.totalStudentsAdmitted
    );
  });

  const schoolTypeData = Array.from(schoolTypeCounts.entries()).map(([type, count]) => ({
    name: SCHOOL_TYPE_LABELS[type] || type,
    type: type,
    schools: count,
    students: schoolTypeStudents.get(type) || 0,
    fill: SCHOOL_TYPE_COLORS[type] || '#94A3B8',
  })).sort((a, b) => b.students - a.students);

  const totalStudents = data.schools.reduce((sum, s) => sum + s.totalStudentsAdmitted, 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <School className="h-4 w-4" />
              Total Feeder Schools
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <span className="text-2xl font-bold">{data.totalSchools.toLocaleString()}</span>
              <p className="text-xs text-muted-foreground">
                Unique schools
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Total Students
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <span className="text-2xl font-bold">{totalStudents.toLocaleString()}</span>
              <p className="text-xs text-muted-foreground">
                From feeder schools
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Award className="h-4 w-4" />
              Top School
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <span className="text-lg font-bold truncate">
                {data.topSchools[0]?.schoolName || 'N/A'}
              </span>
              <p className="text-xs text-muted-foreground">
                {data.topSchools[0]?.totalStudentsAdmitted || 0} students
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              School Types
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <span className="text-2xl font-bold">{schoolTypeData.length}</span>
              <p className="text-xs text-muted-foreground">
                Unique types
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top 10 Feeder Schools Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Top 10 Feeder Schools</CardTitle>
          <CardDescription>
            Schools contributing the most students
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={data.topSchools.slice(0, 10)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis
                type="category"
                dataKey="schoolName"
                width={180}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const school = payload[0].payload;
                    return (
                      <div className="bg-background border rounded-lg p-3 shadow-lg max-w-xs">
                        <p className="font-semibold">{school.schoolName}</p>
                        <p className="text-sm">Type: {SCHOOL_TYPE_LABELS[school.schoolType]}</p>
                        {school.schoolDistrict && (
                          <p className="text-sm">District: {school.schoolDistrict}</p>
                        )}
                        <p className="text-sm">Students: {school.totalStudentsAdmitted}</p>
                        <p className="text-sm">
                          Contribution: {school.contributionPercentage.toFixed(1)}%
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="totalStudentsAdmitted" radius={[0, 4, 4, 0]}>
                {data.topSchools.slice(0, 10).map((school, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={SCHOOL_TYPE_COLORS[school.schoolType] || '#94A3B8'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* School Type Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>School Type Distribution (by Students)</CardTitle>
            <CardDescription>
              Student count by school type
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={schoolTypeData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="students"
                >
                  {schoolTypeData.map((entry, index) => (
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
                          <p className="text-sm">Schools: {data.schools}</p>
                          <p className="text-sm">Students: {data.students.toLocaleString()}</p>
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
            <CardTitle>School Type Summary</CardTitle>
            <CardDescription>
              Breakdown by school category
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {schoolTypeData.map((type, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: type.fill }}
                    />
                    <div>
                      <p className="font-medium">{type.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {type.schools} school{type.schools !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">{type.students.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">
                      {((type.students / totalStudents) * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed School Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Feeder Schools</CardTitle>
          <CardDescription>
            Complete list of schools and their contributions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">#</th>
                  <th className="text-left p-2">School Name</th>
                  <th className="text-left p-2">Type</th>
                  <th className="text-left p-2">District</th>
                  <th className="text-right p-2">Students</th>
                  <th className="text-right p-2">Contribution %</th>
                </tr>
              </thead>
              <tbody>
                {data.schools
                  .sort((a, b) => b.totalStudentsAdmitted - a.totalStudentsAdmitted)
                  .map((school, idx) => (
                    <tr key={idx} className="border-b hover:bg-muted/50">
                      <td className="p-2 text-muted-foreground">{idx + 1}</td>
                      <td className="p-2 font-medium">{school.schoolName}</td>
                      <td className="p-2">
                        <Badge
                          variant="secondary"
                          style={{
                            backgroundColor: `${SCHOOL_TYPE_COLORS[school.schoolType]}20`,
                            color: SCHOOL_TYPE_COLORS[school.schoolType],
                            borderColor: SCHOOL_TYPE_COLORS[school.schoolType],
                          }}
                        >
                          {SCHOOL_TYPE_LABELS[school.schoolType]}
                        </Badge>
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {school.schoolDistrict || 'N/A'}
                      </td>
                      <td className="text-right p-2 font-semibold">
                        {school.totalStudentsAdmitted.toLocaleString()}
                      </td>
                      <td className="text-right p-2">
                        <span className="font-semibold">
                          {school.contributionPercentage.toFixed(2)}%
                        </span>
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
