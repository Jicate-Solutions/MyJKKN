'use client';

/**
 * Day Swiper Component
 * Created: 2026-01-14
 * Description: Swipeable day navigation with Framer Motion gestures
 */

import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { StudentTimetableData, EmptyStateType } from '@/types/student-portal';
import { DayOfWeek } from '@/types/academics';
import { TimetableHeader } from './timetable-header';
import { TimelineCard } from './timeline-card';
import { CurrentClassIndicator } from './current-class-indicator';
import { EmptyState } from './empty-state';
import { CourseDetailSheet } from './course-detail-sheet';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DaySwiperProps {
  timetableData: StudentTimetableData;
}

const DAYS: DayOfWeek[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

export function DaySwiper({ timetableData }: DaySwiperProps) {
  const [currentDayIndex, setCurrentDayIndex] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  // Get current day index on mount
  useEffect(() => {
    const today = new Date().getDay(); // 0 = Sunday, 1 = Monday, etc.
    if (today === 0) {
      // Sunday - default to Monday
      setCurrentDayIndex(0);
    } else {
      // Map day index (Monday = 1, Saturday = 6)
      setCurrentDayIndex(today - 1);
    }
  }, []);

  // Filter slots for current day
  const todaySlots = useMemo(() => {
    const currentDay = DAYS[currentDayIndex];
    return timetableData.slots
      .filter(slot => slot.day === currentDay)
      .sort((a, b) => {
        // Sort by period start time
        const aTime = a.period.start_time;
        const bTime = b.period.start_time;
        return aTime.localeCompare(bTime);
      });
  }, [timetableData.slots, currentDayIndex]);

  // Handle swipe gestures
  const handleDragEnd = (event: any, info: PanInfo) => {
    const threshold = 50; // px

    if (info.offset.x > threshold && currentDayIndex > 0) {
      // Swipe right - previous day
      setCurrentDayIndex(prev => prev - 1);
    } else if (info.offset.x < -threshold && currentDayIndex < DAYS.length - 1) {
      // Swipe left - next day
      setCurrentDayIndex(prev => prev + 1);
    }
  };

  // Handle day button click
  const goToDay = (dayIndex: number) => {
    setCurrentDayIndex(dayIndex);
  };

  // Handle card click
  const handleCardClick = (slot: any) => {
    setSelectedSlot(slot);
    setIsSheetOpen(true);
  };

  // Check if it's Sunday
  const isToday = new Date().getDay() - 1 === currentDayIndex;
  const isSunday = new Date().getDay() === 0 && currentDayIndex === 0;

  return (
    <div className="space-y-4">
      {/* Header with day selector and export */}
      <TimetableHeader
        currentDay={DAYS[currentDayIndex]}
        currentDayIndex={currentDayIndex}
        onDayChange={goToDay}
        timetableData={timetableData}
      />

      {/* Swipe Container */}
      <div className="relative">
        {/* Swipe indicators */}
        {currentDayIndex > 0 && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
            <div className="bg-background/80 backdrop-blur-sm rounded-full p-2 shadow-lg">
              <ChevronLeft className="w-6 h-6 text-muted-foreground" />
            </div>
          </div>
        )}
        {currentDayIndex < DAYS.length - 1 && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
            <div className="bg-background/80 backdrop-blur-sm rounded-full p-2 shadow-lg">
              <ChevronRight className="w-6 h-6 text-muted-foreground" />
            </div>
          </div>
        )}

        {/* Swipeable content */}
        <motion.div
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          onDragEnd={handleDragEnd}
          className="touch-pan-y"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={currentDayIndex}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.3 }}
            >
              {isSunday ? (
                <EmptyState type="weekend" />
              ) : todaySlots.length === 0 ? (
                <EmptyState type="no-classes" />
              ) : (
                <div className="space-y-6">
                  {/* Current period indicator */}
                  {isToday && (
                    <CurrentClassIndicator
                      slots={todaySlots}
                      periods={timetableData.periods}
                    />
                  )}

                  {/* Timeline cards */}
                  <div className="space-y-3">
                    {todaySlots.map((slot, index) => (
                      <TimelineCard
                        key={slot.slot_id || index}
                        slot={slot}
                        onClick={() => handleCardClick(slot)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Course Detail Sheet */}
      <CourseDetailSheet
        slot={selectedSlot}
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
      />
    </div>
  );
}
