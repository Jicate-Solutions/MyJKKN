/**
 * Launch Debug Statistics Cards Component
 * Display key metrics for LTI launches
 *
 * Created: 2026-01-12
 */

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Rocket, Clock, GraduationCap, Briefcase } from 'lucide-react';

interface LaunchDebugStatsProps {
  totalLaunches: number;
  avgSessionDuration: number; // in seconds
  studentLaunches: number;
  facultyLaunches: number;
}

export function LaunchDebugStats({
  totalLaunches,
  avgSessionDuration,
  studentLaunches,
  facultyLaunches
}: LaunchDebugStatsProps) {
  // Convert seconds to minutes
  const avgMinutes = Math.floor(avgSessionDuration / 60);
  const avgSeconds = avgSessionDuration % 60;
  const durationText =
    avgMinutes > 0
      ? `${avgMinutes}m ${avgSeconds}s`
      : `${avgSeconds}s`;

  const studentPercentage =
    totalLaunches > 0
      ? ((studentLaunches / totalLaunches) * 100).toFixed(1)
      : '0.0';
  const facultyPercentage =
    totalLaunches > 0
      ? ((facultyLaunches / totalLaunches) * 100).toFixed(1)
      : '0.0';

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Total Launches */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Launches</CardTitle>
          <Rocket className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalLaunches.toLocaleString()}</div>
          <p className="text-xs text-muted-foreground">In date range</p>
        </CardContent>
      </Card>

      {/* Average Session Duration */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Avg Session</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{durationText}</div>
          <p className="text-xs text-muted-foreground">
            {avgSessionDuration === 0 ? 'No data' : 'Average duration'}
          </p>
        </CardContent>
      </Card>

      {/* Student Launches */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Student Launches</CardTitle>
          <GraduationCap className="h-4 w-4 text-blue-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-blue-600">
            {studentLaunches.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground">
            {studentPercentage}% of total
          </p>
        </CardContent>
      </Card>

      {/* Faculty Launches */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Faculty Launches</CardTitle>
          <Briefcase className="h-4 w-4 text-green-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">
            {facultyLaunches.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground">
            {facultyPercentage}% of total
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
