'use client';

/**
 * Course Detail Sheet Component
 * Created: 2026-01-14
 * Description: Modal displaying detailed course information
 */

import { EnrichedTimetableSlot } from '@/types/student-portal';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Clock, User, MapPin, BookOpen } from 'lucide-react';

interface CourseDetailSheetProps {
  slot: EnrichedTimetableSlot | null;
  isOpen: boolean;
  onClose: () => void;
}

export function CourseDetailSheet({ slot, isOpen, onClose }: CourseDetailSheetProps) {
  if (!slot) return null;

  // Format time for display
  const formatTime = (time: string) => {
    try {
      const [hours, minutes] = time.split(':').map(Number);
      const period = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 || 12;
      return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
    } catch {
      return time;
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent
        side="bottom"
        className="h-[85vh] md:h-auto md:max-w-lg md:!left-auto md:!right-0 md:!top-0 md:!translate-x-0 md:!translate-y-0 rounded-t-3xl md:rounded-l-3xl md:rounded-tr-none flex flex-col"
      >
        <SheetHeader className="space-y-3 flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              <Badge variant="secondary" className="text-sm font-mono">
                {slot.course.course_code}
              </Badge>
              <SheetTitle className="text-2xl">{slot.course.course_name}</SheetTitle>
            </div>
          </div>
          <SheetDescription>{slot.period.period_name}</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6 overflow-y-auto flex-1">
          {/* Period Timing */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Schedule
            </h4>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-background">
                <Clock className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">
                  {formatTime(slot.period.start_time)} - {formatTime(slot.period.end_time)}
                </p>
                <p className="text-sm text-muted-foreground">{slot.period.period_name}</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Faculty Details */}
          {slot.staff_members.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Faculty
              </h4>
              <div className="space-y-2">
                {slot.staff_members.map((staff, index) => (
                  <div
                    key={staff.staff_id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-background">
                      <User className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">{staff.staff_name}</p>
                      <p className="text-sm text-muted-foreground">Instructor</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {slot.room && (
            <>
              <Separator />

              {/* Room/Location */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Location
                </h4>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-background">
                    <MapPin className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">{slot.room}</p>
                    <p className="text-sm text-muted-foreground">Classroom</p>
                  </div>
                </div>
              </div>
            </>
          )}

          <Separator />

          {/* Course Info */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              About
            </h4>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-background">
                <BookOpen className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="font-medium">{slot.course.course_name}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Course Code: {slot.course.course_code}
                </p>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
