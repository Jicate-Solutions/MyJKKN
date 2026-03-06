'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { FacilitatorDepartmentBreakdown } from '@/types/attendance';

interface Props {
  breakdown: FacilitatorDepartmentBreakdown[];
}

export function DepartmentBreakdown({ breakdown }: Props) {
  const maxAssigned = Math.max(...breakdown.map((d) => d.totalAssigned ?? d.totalMarked), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Department Breakdown</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {breakdown.map((dept) => {
          const assigned = dept.totalAssigned ?? dept.totalMarked;
          const marked = dept.totalMarked;
          const pending = dept.totalPending ?? (assigned - marked);
          const rate = assigned > 0 ? (marked / assigned) * 100 : 0;
          return (
            <div key={dept.departmentId} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium truncate max-w-[55%]">
                  {dept.departmentName}
                </span>
                <span className="text-muted-foreground text-xs">
                  {dept.facilitatorCount} staff
                </span>
              </div>
              <Progress
                value={(assigned / maxAssigned) * 100}
                className="h-2 bg-muted"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  <span className="text-green-600 font-medium">{marked}</span> marked
                  {' / '}
                  <span className="text-indigo-600 font-medium">{assigned}</span> assigned
                </span>
                {pending > 0 && (
                  <span className="text-red-500 font-medium">{pending} pending</span>
                )}
                {pending === 0 && assigned > 0 && (
                  <span className="text-green-600 font-medium">{rate.toFixed(0)}%</span>
                )}
              </div>
            </div>
          );
        })}
        {breakdown.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No department data available
          </p>
        )}
      </CardContent>
    </Card>
  );
}
