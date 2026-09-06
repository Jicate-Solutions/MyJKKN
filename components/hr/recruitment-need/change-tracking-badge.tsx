'use client';

/**
 * Change Tracking Badge — "N changes since last visit" indicator.
 * Records a visit on mount via useRecordVisit().
 * Compares current signal timestamps to last visit time.
 */

import { useEffect, useMemo, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Bell } from 'lucide-react';
import {
  useLastVisit,
  useRecordVisit,
  useRecruitmentSignals,
} from '@/hooks/hr/recruitment-need/use-recruitment-signal';

interface ChangeTrackingBadgeProps {
  className?: string;
}

export function ChangeTrackingBadge({ className }: ChangeTrackingBadgeProps) {
  const { data: lastVisit } = useLastVisit();
  const { data: signals } = useRecruitmentSignals();
  const recordVisit = useRecordVisit();
  const hasRecorded = useRef(false);

  // Count signals updated after last visit
  const changeCount = useMemo(() => {
    if (!lastVisit?.last_visited_at || !signals?.length) return 0;
    const visitTime = new Date(lastVisit.last_visited_at).getTime();
    return signals.filter((s) => {
      const updatedTime = new Date(s.updated_at).getTime();
      return updatedTime > visitTime;
    }).length;
  }, [lastVisit, signals]);

  // Record visit on mount (only once)
  useEffect(() => {
    if (!hasRecorded.current) {
      hasRecorded.current = true;
      // Small delay so the badge is visible before recording
      const timer = setTimeout(() => {
        recordVisit.mutate(undefined);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (changeCount === 0) return null;

  return (
    <Badge variant="secondary" className={`gap-1 text-xs ${className ?? ''}`}>
      <Bell className="h-3 w-3" />
      {changeCount} change{changeCount !== 1 ? 's' : ''} since last visit
    </Badge>
  );
}
