'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { CheckCircle2, ClipboardList } from 'lucide-react';

interface SF100CheckInPromptProps {
  /** ISO date string of last check-in, or null if never checked in */
  lastCheckInAt: string | null;
  /** Enrollment ID used to build the check-in form URL */
  enrollmentId: string;
}

function isThisWeek(dateStr: string): boolean {
  const date = new Date(dateStr);
  const now = new Date();

  // Find the Monday of the current week
  const dayOfWeek = now.getDay(); // 0 = Sunday
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysFromMonday);
  monday.setHours(0, 0, 0, 0);

  return date >= monday;
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function SF100CheckInPrompt({ lastCheckInAt, enrollmentId }: SF100CheckInPromptProps) {
  const checkedInThisWeek = lastCheckInAt ? isThisWeek(lastCheckInAt) : false;

  if (checkedInThisWeek) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-green-50 border border-green-200">
        <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-green-800">
            Check-in submitted
          </p>
          {lastCheckInAt && (
            <p className="text-xs text-green-600">
              Submitted {formatRelativeDate(lastCheckInAt)}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200">
      <ClipboardList className="h-5 w-5 text-amber-600 flex-shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-800">
          Weekly check-in due
        </p>
        <p className="text-xs text-amber-600">
          {lastCheckInAt
            ? `Last check-in: ${formatRelativeDate(lastCheckInAt)}`
            : 'No check-in yet — share your first progress update'}
        </p>
      </div>
      <Button
        size="sm"
        variant="default"
        asChild
        className="flex-shrink-0 bg-amber-600 hover:bg-amber-700 text-white"
      >
        <Link
          href={`/startup-studio/solve-for-100/dashboard/check-in?enrollment=${enrollmentId}`}
          aria-label="Submit weekly check-in"
        >
          Submit
        </Link>
      </Button>
    </div>
  );
}
