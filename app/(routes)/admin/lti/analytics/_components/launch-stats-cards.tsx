/**
 * Launch Statistics Cards Component
 * Display key metrics for LTI launches
 *
 * Created: 2026-01-12
 */

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Rocket, Users, GraduationCap, Briefcase } from 'lucide-react';

interface LaunchStatsCardsProps {
  totalLaunches: number;
  uniqueUsers: number;
  studentLaunches: number;
  facultyLaunches: number;
}

export function LaunchStatsCards({
  totalLaunches,
  uniqueUsers,
  studentLaunches,
  facultyLaunches
}: LaunchStatsCardsProps) {
  const successRate = totalLaunches > 0 ? 100 : 0; // Simplified - can track failures later

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
          <p className="text-xs text-muted-foreground">
            In selected date range
          </p>
        </CardContent>
      </Card>

      {/* Unique Users */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Unique Users</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{uniqueUsers.toLocaleString()}</div>
          <p className="text-xs text-muted-foreground">
            {totalLaunches > 0
              ? `Avg ${(totalLaunches / uniqueUsers).toFixed(1)} launches/user`
              : 'No launches yet'}
          </p>
        </CardContent>
      </Card>

      {/* Student Launches */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Student Launches
          </CardTitle>
          <GraduationCap className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-blue-600">
            {studentLaunches.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground">
            {totalLaunches > 0
              ? `${((studentLaunches / totalLaunches) * 100).toFixed(1)}% of total`
              : '0% of total'}
          </p>
        </CardContent>
      </Card>

      {/* Faculty Launches */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Faculty Launches
          </CardTitle>
          <Briefcase className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">
            {facultyLaunches.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground">
            {totalLaunches > 0
              ? `${((facultyLaunches / totalLaunches) * 100).toFixed(1)}% of total`
              : '0% of total'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
