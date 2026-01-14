'use client';

/**
 * Timeline Card Component
 * Created: 2026-01-14
 * Description: Individual class card in timeline view
 */

import { motion } from 'framer-motion';
import { EnrichedTimetableSlot } from '@/types/student-portal';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, User, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TimelineCardProps {
  slot: EnrichedTimetableSlot;
  isCurrentPeriod?: boolean;
  onClick?: () => void;
}

export function TimelineCard({ slot, isCurrentPeriod = false, onClick }: TimelineCardProps) {
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

  // Handle break periods
  if (slot.period.is_break) {
    return (
      <Card className="p-4 bg-muted/50 border-dashed">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="w-4 h-4" />
          <span className="font-medium">Break Time</span>
          <span className="text-sm">
            {formatTime(slot.period.start_time)} - {formatTime(slot.period.end_time)}
          </span>
        </div>
      </Card>
    );
  }

  return (
    <motion.div whileTap={{ scale: 0.98 }} transition={{ duration: 0.1 }}>
      <Card
        className={cn(
          'p-4 cursor-pointer transition-all duration-200',
          'hover:shadow-md active:shadow-sm',
          'min-h-[120px] flex flex-col gap-3',
          isCurrentPeriod &&
            'border-l-4 border-l-green-500 bg-green-50/50 dark:bg-green-950/20 shadow-md'
        )}
        onClick={onClick}
      >
        {/* Time Badge */}
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="gap-1.5">
            <Clock className="w-3 h-3" />
            <span className="text-xs">
              {formatTime(slot.period.start_time)} - {formatTime(slot.period.end_time)}
            </span>
          </Badge>
          {isCurrentPeriod && (
            <Badge variant="default" className="bg-green-500 hover:bg-green-600">
              LIVE
            </Badge>
          )}
        </div>

        {/* Course Info */}
        <div className="space-y-1">
          <div className="flex items-start gap-2">
            <Badge variant="secondary" className="text-xs font-mono">
              {slot.course.course_code}
            </Badge>
            <h3 className="text-base font-semibold text-foreground leading-tight flex-1">
              {slot.course.course_name}
            </h3>
          </div>
        </div>

        {/* Faculty and Room */}
        <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
          {slot.staff_members.length > 0 && (
            <div className="flex items-center gap-1.5">
              <User className="w-4 h-4" />
              <span className="line-clamp-1">
                {slot.staff_members.map(s => s.staff_name).join(', ')}
              </span>
            </div>
          )}
          {slot.room && (
            <div className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4" />
              <span>{slot.room}</span>
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
