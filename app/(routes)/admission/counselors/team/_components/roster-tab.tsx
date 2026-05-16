'use client';

// roster-tab.tsx
// Tab 2: 7-day availability grid per counselor.
// Empty state shown gracefully when junction table has no rows (pre-Phase-7).
// Admin users can click cells to toggle availability.

import { useCounselorMembers, useCounselorSchedules, useToggleScheduleSlot } from '@/hooks/admission/use-counselor-team-data';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CalendarDays, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface RosterTabProps {
  institutionId: string | undefined;
  isAdmin: boolean;
}

export function RosterTab({ institutionId, isAdmin }: RosterTabProps) {
  const { data: members = [], isLoading: loadingMembers } = useCounselorMembers(institutionId);
  const { data: schedules = [], isLoading: loadingSchedules, error } = useCounselorSchedules(institutionId);
  const toggleSlot = useToggleScheduleSlot();

  const isLoading = loadingMembers || loadingSchedules;

  // Build lookup: counselorId -> Map<dayOfWeek, isAvailable>
  const scheduleMap = new Map<string, Map<number, boolean>>();
  for (const row of schedules) {
    if (!scheduleMap.has(row.counselor_id)) {
      scheduleMap.set(row.counselor_id, new Map());
    }
    scheduleMap.get(row.counselor_id)!.set(row.day_of_week, row.is_available);
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        <AlertCircle className="h-5 w-5 flex-shrink-0" />
        <p className="text-sm">{(error as Error).message}</p>
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center text-muted-foreground">
        <CalendarDays className="mb-4 h-12 w-12 opacity-40" />
        <p className="font-medium">No counselors to display</p>
      </div>
    );
  }

  const hasAnySchedule = schedules.length > 0;

  return (
    <div className="space-y-4">
      {!hasAnySchedule && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
          No schedule data yet — cells default to available. Admins can click to set availability.
          Schedule data is seeded in Phase 7.
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left font-medium text-muted-foreground">Counselor</th>
              {DAYS.map((d) => (
                <th key={d} className="p-3 text-center font-medium text-muted-foreground w-16">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((m, idx) => {
              const dayMap = scheduleMap.get(m.id) ?? new Map<number, boolean>();
              return (
                <tr key={m.id} className={cn('border-b last:border-0', idx % 2 === 0 ? '' : 'bg-muted/20')}>
                  <td className="p-3 font-medium whitespace-nowrap">{m.name}</td>
                  {DAYS.map((_, dayIdx) => {
                    // If no schedule row exists, default to available
                    const available = dayMap.has(dayIdx) ? dayMap.get(dayIdx)! : true;
                    return (
                      <td key={dayIdx} className="p-1 text-center">
                        {isAdmin ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                              'h-8 w-12 rounded text-xs font-medium transition-colors',
                              available
                                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                : 'bg-red-100 text-red-700 hover:bg-red-200'
                            )}
                            disabled={toggleSlot.isPending}
                            onClick={() =>
                              toggleSlot.mutate({
                                counselorId: m.id,
                                dayOfWeek: dayIdx,
                                isAvailable: !available,
                              })
                            }
                            aria-label={`${m.name} ${DAYS[dayIdx]}: ${available ? 'available' : 'unavailable'}`}
                          >
                            {available ? 'On' : 'Off'}
                          </Button>
                        ) : (
                          <Badge
                            variant={available ? 'default' : 'secondary'}
                            className={cn(
                              'text-xs',
                              available ? 'bg-green-100 text-green-700' : 'text-muted-foreground'
                            )}
                          >
                            {available ? 'On' : 'Off'}
                          </Badge>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
