'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown, Building2 } from 'lucide-react';
import type { FacilitatorDepartmentBreakdown } from '@/types/attendance';

interface Props {
  breakdown: FacilitatorDepartmentBreakdown[];
}

export function DepartmentBreakdown({ breakdown }: Props) {
  const [isOpen, setIsOpen] = useState(true);
  const maxAssigned = Math.max(...breakdown.map((d) => d.totalAssigned ?? d.totalMarked), 1);

  if (breakdown.length === 0) {
    return null;
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-2 cursor-pointer hover:bg-accent/50 transition-colors rounded-t-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm sm:text-base">Department Breakdown</CardTitle>
                <span className="text-[10px] sm:text-xs text-muted-foreground">
                  ({breakdown.length})
                </span>
              </div>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {breakdown.map((dept) => {
                const assigned = dept.totalAssigned ?? dept.totalMarked;
                const marked = dept.totalMarked;
                const pending = dept.totalPending ?? (assigned - marked);
                const rate = assigned > 0 ? (marked / assigned) * 100 : 0;
                const rateColor =
                  rate >= 80 ? 'text-green-600 dark:text-green-400' :
                  rate >= 60 ? 'text-blue-600 dark:text-blue-400' :
                  rate >= 40 ? 'text-yellow-600 dark:text-yellow-400' :
                  'text-red-600 dark:text-red-400';

                return (
                  <div
                    key={dept.departmentId}
                    className="rounded-lg border bg-card p-3 space-y-2 hover:shadow-sm transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-xs sm:text-sm leading-tight line-clamp-2">
                        {dept.departmentName}
                      </span>
                      <span className={`text-sm sm:text-base font-bold shrink-0 ${rateColor}`}>
                        {rate.toFixed(0)}%
                      </span>
                    </div>
                    <Progress
                      value={rate}
                      className="h-1.5 bg-muted"
                    />
                    <div className="flex items-center justify-between text-[10px] sm:text-xs text-muted-foreground">
                      <span>
                        <span className="text-green-600 dark:text-green-400 font-medium">{marked}</span>
                        {' / '}
                        <span className="text-indigo-600 dark:text-indigo-400 font-medium">{assigned}</span>
                        <span className="hidden sm:inline"> marked</span>
                      </span>
                      <span className="flex items-center gap-2">
                        {pending > 0 && (
                          <span className="text-red-500 font-medium">{pending} pending</span>
                        )}
                        <span>{dept.facilitatorCount} staff</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
