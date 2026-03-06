'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { FacilitatorDepartmentBreakdown } from '@/types/attendance';

interface Props {
  breakdown: FacilitatorDepartmentBreakdown[];
}

export function DepartmentBreakdown({ breakdown }: Props) {
  const maxMarked = Math.max(...breakdown.map((d) => d.totalMarked), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Department Breakdown</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {breakdown.map((dept) => (
          <div key={dept.departmentId} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium truncate max-w-[60%]">
                {dept.departmentName}
              </span>
              <span className="text-muted-foreground text-xs">
                {dept.facilitatorCount} staff · {dept.totalMarked} periods
              </span>
            </div>
            <Progress
              value={(dept.totalMarked / maxMarked) * 100}
              className="h-2"
            />
          </div>
        ))}
        {breakdown.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No department data available
          </p>
        )}
      </CardContent>
    </Card>
  );
}
