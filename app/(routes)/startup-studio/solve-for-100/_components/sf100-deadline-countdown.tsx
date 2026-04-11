'use client';

import { Clock } from 'lucide-react';

interface SF100DeadlineCountdownProps {
  /** ISO date string for the program deadline */
  deadline: string;
  /** Program start date to calculate "Day X of Y" */
  startDate?: string;
  /** Total program duration in days */
  totalDays?: number;
}

function getDaysRemaining(deadline: string): number {
  const now = new Date();
  const end = new Date(deadline);
  const diff = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function getCurrentDay(startDate?: string): number {
  if (!startDate) return 0;
  const now = new Date();
  const start = new Date(startDate);
  const diff = now.getTime() - start.getTime();
  return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function SF100DeadlineCountdown({
  deadline,
  startDate,
  totalDays = 210,
}: SF100DeadlineCountdownProps) {
  const daysRemaining = getDaysRemaining(deadline);
  const currentDay = getCurrentDay(startDate);

  const colorClass =
    daysRemaining > 60
      ? 'bg-green-100 text-green-800 border-green-200'
      : daysRemaining > 30
        ? 'bg-amber-100 text-amber-800 border-amber-200'
        : 'bg-red-100 text-red-800 border-red-200';

  const iconColor =
    daysRemaining > 60
      ? 'text-green-600'
      : daysRemaining > 30
        ? 'text-amber-600'
        : 'text-red-600';

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium ${colorClass}`}>
      <Clock className={`h-3.5 w-3.5 ${iconColor}`} />
      {startDate ? (
        <span>
          Day {currentDay} of {totalDays}
        </span>
      ) : (
        <span>{daysRemaining} days left</span>
      )}
    </div>
  );
}
