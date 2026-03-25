/**
 * User Role Distribution Component
 * Donut chart showing student vs faculty launches
 *
 * Created: 2026-01-12
 */

'use client';

import { GraduationCap, Briefcase } from 'lucide-react';

interface UserRoleDistributionProps {
  studentLaunches: number;
  facultyLaunches: number;
}

export function UserRoleDistribution({
  studentLaunches,
  facultyLaunches
}: UserRoleDistributionProps) {
  const total = studentLaunches + facultyLaunches;

  if (total === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No launch data available</p>
      </div>
    );
  }

  const studentPercentage = (studentLaunches / total) * 100;
  const facultyPercentage = (facultyLaunches / total) * 100;

  return (
    <div className="space-y-6">
      {/* Donut Chart (using simple circular progress) */}
      <div className="flex items-center justify-center py-8">
        <div className="relative">
          {/* Outer circle */}
          <div className="w-48 h-48 rounded-full border-8 border-secondary relative">
            {/* Student segment (blue) */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(#3b82f6 ${studentPercentage}%, transparent ${studentPercentage}%)`
              }}
            />
            {/* Faculty segment (green) */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(transparent ${studentPercentage}%, #10b981 ${studentPercentage}% ${100}%, transparent ${100}%)`
              }}
            />
            {/* Inner white circle (donut hole) */}
            <div className="absolute inset-4 rounded-full bg-background flex items-center justify-center">
              <div className="text-center">
                <div className="text-2xl font-bold">{total}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="space-y-3">
        {/* Students */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 dark:bg-blue-950">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <div className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-blue-600" />
              <span className="font-medium">Students</span>
            </div>
          </div>
          <div className="text-right">
            <div className="font-bold text-blue-600">
              {studentLaunches.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">
              {studentPercentage.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Faculty */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 dark:bg-green-950">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-green-600" />
              <span className="font-medium">Faculty</span>
            </div>
          </div>
          <div className="text-right">
            <div className="font-bold text-green-600">
              {facultyLaunches.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">
              {facultyPercentage.toFixed(1)}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
