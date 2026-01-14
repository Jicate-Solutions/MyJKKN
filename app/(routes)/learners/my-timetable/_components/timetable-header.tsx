'use client';

/**
 * Timetable Header Component
 * Created: 2026-01-14
 * Description: Header with day selector and export actions
 */

import { DayOfWeek } from '@/types/academics';
import { StudentTimetableData } from '@/types/student-portal';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExportActions } from './export-actions';
import { cn } from '@/lib/utils';

interface TimetableHeaderProps {
  currentDay: DayOfWeek;
  currentDayIndex: number;
  onDayChange: (dayIndex: number) => void;
  timetableData: StudentTimetableData;
}

const DAYS: { label: string; value: DayOfWeek }[] = [
  { label: 'Mon', value: 'MONDAY' },
  { label: 'Tue', value: 'TUESDAY' },
  { label: 'Wed', value: 'WEDNESDAY' },
  { label: 'Thu', value: 'THURSDAY' },
  { label: 'Fri', value: 'FRIDAY' },
  { label: 'Sat', value: 'SATURDAY' }
];

export function TimetableHeader({
  currentDay,
  currentDayIndex,
  onDayChange,
  timetableData
}: TimetableHeaderProps) {
  return (
    <Card className="p-4 space-y-4">
      {/* Day Selector */}
      <div className="grid grid-cols-6 gap-2">
        {DAYS.map((day, index) => (
          <Button
            key={day.value}
            variant={currentDayIndex === index ? 'default' : 'outline'}
            size="sm"
            onClick={() => onDayChange(index)}
            className={cn(
              'h-auto py-2 px-1 flex flex-col gap-1',
              currentDayIndex === index && 'shadow-md'
            )}
          >
            <span className="text-xs font-medium">{day.label}</span>
          </Button>
        ))}
      </div>

      {/* Current Day Display and Export */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            {currentDay.charAt(0) + currentDay.slice(1).toLowerCase()}
          </h3>
          <p className="text-sm text-muted-foreground">
            {timetableData.slots.filter(s => s.day === currentDay).length} classes scheduled
          </p>
        </div>
        <ExportActions timetableData={timetableData} currentDay={currentDay} />
      </div>
    </Card>
  );
}
