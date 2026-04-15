'use client';

import { WidgetContainer } from '../shared/widget-container';
import { Clock, MapPin, User, BookOpen } from 'lucide-react';
import { useStudentTimetableToday } from '@/hooks/dashboard/use-student-dashboard';
import { useRouter } from 'next/navigation';

interface TimetableTodayWidgetProps {
  studentId: string;
  sectionId: string;
  isVisible: boolean;
}

export function TimetableTodayWidget({
  studentId,
  sectionId,
  isVisible,
}: TimetableTodayWidgetProps) {
  const router = useRouter();
  const { data: timetable = [], isLoading, error } = useStudentTimetableToday(studentId, sectionId);

  if (!isVisible) return null;

  const handleClick = () => {
    router.push('/learners/my-timetable');
  };

  return (
    <WidgetContainer
      title="Today's Classes"
      icon={Clock}
      isLoading={isLoading}
      error={error ? error.message : null}
      onClick={handleClick}
      className="row-span-2"
    >
      <div className="space-y-3">
        {timetable.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No classes scheduled for today</p>
          </div>
        ) : (
          timetable.map((slot, index) => (
            <div
              key={`${slot.period_id}-${index}`}
              className="relative pl-4 pb-4 last:pb-0 border-l border-border last:border-l-0"
            >
              <div className="absolute left-[-5px] top-1 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-background" />
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    {slot.start_time} - {slot.end_time}
                  </span>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    {slot.period_name}
                  </span>
                </div>
                <h4 className="text-sm font-semibold">{slot.course_name}</h4>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    <span className="truncate max-w-[100px]">{slot.faculty_name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    <span>{slot.room}</span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </WidgetContainer>
  );
}
