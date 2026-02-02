'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
  LineChart,
  Line,
} from 'recharts';
import {
  AlertTriangle,
  TrendingUp,
  Users,
  UserCheck,
  UserX,
  AlertCircle,
} from 'lucide-react';
import type { IntakeCapacityMetrics } from '@/types/learner-analytics';

interface IntakeCapacityTabProps {
  data: IntakeCapacityMetrics[];
}

export function IntakeCapacityTab({ data }: IntakeCapacityTabProps) {
  if (!data || data.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          No intake capacity data available for the selected filters.
        </AlertDescription>
      </Alert>
    );
  }

  // Calculate summary metrics
  const totalSanctioned = data.reduce((sum, d) => sum + d.sanctionedIntake, 0);
  const totalActual = data.reduce((sum, d) => sum + d.actualIntake, 0);
  const overIntakePrograms = data.filter(d => d.overIntakeFlag).length;
  const avgUtilization = data.reduce((sum, d) => sum + d.seatUtilization, 0) / data.length;
  const totalUnfilled = data.reduce((sum, d) => sum + d.unfilledSeats, 0);

  // Sort data for charts
  const sortedByUtilization = [...data].sort((a, b) => b.seatUtilization - a.seatUtilization);
  const overIntakeData = data.filter(d => d.overIntakeFlag);
  const underUtilizedData = data.filter(d => d.seatUtilization < 60);

  // Get color based on utilization
  const getUtilizationColor = (utilization: number) => {
    if (utilization >= 90) return '#10B981'; // Green
    if (utilization >= 70) return '#3B82F6'; // Blue
    if (utilization >= 50) return '#F59E0B'; // Amber
    return '#EF4444'; // Red
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Sanctioned Intake
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-500" />
              <span className="text-2xl font-bold">{totalSanctioned.toLocaleString()}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Across {data.length} programs
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Actual Intake
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-green-500" />
              <span className="text-2xl font-bold">{totalActual.toLocaleString()}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {avgUtilization.toFixed(1)}% average utilization
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Unfilled Seats
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <UserX className="h-5 w-5 text-amber-500" />
              <span className="text-2xl font-bold">{totalUnfilled.toLocaleString()}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {((totalUnfilled / totalSanctioned) * 100).toFixed(1)}% vacant
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Over-Intake Programs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <span className="text-2xl font-bold">{overIntakePrograms}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {((overIntakePrograms / data.length) * 100).toFixed(0)}% of programs
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Over-Intake Alert */}
      {overIntakeData.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>{overIntakeData.length} program(s)</strong> have exceeded sanctioned intake.
            Total over-intake: {overIntakeData.reduce((sum, d) => sum + d.overIntakeCount, 0)} students.
          </AlertDescription>
        </Alert>
      )}

      {/* Seat Utilization Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Seat Utilization by Program</CardTitle>
          <CardDescription>
            Percentage of sanctioned intake filled (sorted by utilization)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={sortedByUtilization} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 150]} />
              <YAxis
                type="category"
                dataKey="programName"
                width={150}
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload as IntakeCapacityMetrics;
                    return (
                      <div className="bg-background border rounded-lg p-3 shadow-lg">
                        <p className="font-semibold">{data.programName}</p>
                        <p className="text-sm">Sanctioned: {data.sanctionedIntake}</p>
                        <p className="text-sm">Actual: {data.actualIntake}</p>
                        <p className="text-sm font-semibold">
                          Utilization: {data.seatUtilization}%
                        </p>
                        {data.overIntakeFlag && (
                          <p className="text-sm text-red-500">
                            Over-intake: +{data.overIntakeCount}
                          </p>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="seatUtilization" radius={[0, 4, 4, 0]}>
                {sortedByUtilization.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getUtilizationColor(entry.seatUtilization)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Detailed Program Table */}
      <Card>
        <CardHeader>
          <CardTitle>Program-wise Intake Details</CardTitle>
          <CardDescription>
            Complete intake capacity metrics for all programs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Program</th>
                  <th className="text-right p-2">Sanctioned</th>
                  <th className="text-right p-2">Actual</th>
                  <th className="text-right p-2">Utilization</th>
                  <th className="text-right p-2">Unfilled</th>
                  <th className="text-right p-2">Waitlist</th>
                  <th className="text-right p-2">Stability</th>
                  <th className="text-center p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map((program, idx) => (
                  <tr key={idx} className="border-b hover:bg-muted/50">
                    <td className="p-2 font-medium">{program.programName}</td>
                    <td className="text-right p-2">{program.sanctionedIntake}</td>
                    <td className="text-right p-2">{program.actualIntake}</td>
                    <td className="text-right p-2">
                      <div className="flex items-center gap-2 justify-end">
                        <Progress
                          value={Math.min(program.seatUtilization, 100)}
                          className="w-16 h-2"
                        />
                        <span className="text-xs font-semibold">
                          {program.seatUtilization}%
                        </span>
                      </div>
                    </td>
                    <td className="text-right p-2">
                      {program.unfilledSeats > 0 ? (
                        <span className="text-amber-600">{program.unfilledSeats}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="text-right p-2">{program.waitlistCount}</td>
                    <td className="text-right p-2">
                      <Badge variant={program.stabilityIndex >= 70 ? 'default' : 'secondary'}>
                        {program.stabilityIndex}%
                      </Badge>
                    </td>
                    <td className="text-center p-2">
                      {program.overIntakeFlag ? (
                        <Badge variant="destructive">
                          +{program.overIntakeCount}
                        </Badge>
                      ) : program.seatUtilization >= 90 ? (
                        <Badge variant="default">Optimal</Badge>
                      ) : program.seatUtilization >= 70 ? (
                        <Badge variant="secondary">Good</Badge>
                      ) : (
                        <Badge variant="outline">Low</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Under-Utilized Programs Alert */}
      {underUtilizedData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Under-Utilized Programs (&lt;60% Utilization)
            </CardTitle>
            <CardDescription>
              {underUtilizedData.length} program(s) need attention to improve intake
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {underUtilizedData.map((program, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">{program.programName}</p>
                    <p className="text-sm text-muted-foreground">
                      {program.actualIntake} / {program.sanctionedIntake} students
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-amber-600">
                      {program.seatUtilization}%
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {program.unfilledSeats} unfilled
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
