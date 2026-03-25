'use client';

/**
 * Current Class Indicator Component
 * Created: 2026-01-14
 * Description: Shows current period with live countdown timer
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { EnrichedTimetableSlot } from '@/types/student-portal';
import { Period } from '@/types/academics';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Zap } from 'lucide-react';

interface CurrentClassIndicatorProps {
  slots: EnrichedTimetableSlot[];
  periods: Period[];
}

export function CurrentClassIndicator({ slots, periods }: CurrentClassIndicatorProps) {
  const [currentPeriod, setCurrentPeriod] = useState<{
    slot: EnrichedTimetableSlot | null;
    minutesRemaining: number;
  } | null>(null);

  useEffect(() => {
    const detectCurrentPeriod = () => {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      for (const slot of slots) {
        const [startH, startM] = slot.period.start_time.split(':').map(Number);
        const [endH, endM] = slot.period.end_time.split(':').map(Number);
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;

        if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
          const minutesRemaining = endMinutes - currentMinutes;
          setCurrentPeriod({ slot, minutesRemaining });
          return;
        }
      }

      setCurrentPeriod(null);
    };

    detectCurrentPeriod();
    const interval = setInterval(detectCurrentPeriod, 10000); // Update every 10 seconds

    return () => clearInterval(interval);
  }, [slots]);

  if (!currentPeriod || !currentPeriod.slot) {
    return null;
  }

  const { slot, minutesRemaining } = currentPeriod;

  // Format time remaining
  const formatTimeRemaining = (minutes: number) => {
    if (minutes < 1) return 'Ending soon';
    if (minutes < 60) return `${minutes} min${minutes > 1 ? 's' : ''} remaining`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m remaining`;
  };

  return (
    <Card className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border-green-200 dark:border-green-800">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          {/* LIVE Badge */}
          <div className="flex items-center gap-2">
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-500 text-white text-xs font-medium"
            >
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              LIVE
            </motion.div>
            <Badge variant="outline" className="gap-1">
              <Zap className="w-3 h-3" />
              Current Period
            </Badge>
          </div>

          {/* Course Info */}
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              {slot.course.course_name}
            </h3>
            <p className="text-sm text-muted-foreground">
              {slot.course.course_code}
              {slot.staff_members.length > 0 && ` • ${slot.staff_members[0].staff_name}`}
            </p>
          </div>

          {/* Time Remaining */}
          <div className="flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium text-green-700 dark:text-green-400">
              {formatTimeRemaining(minutesRemaining)}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
