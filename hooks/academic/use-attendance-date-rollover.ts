'use client';

// BUG-006152 (17 Sep): the attendance page set its date ONCE, when it opened.
// Left open overnight (the installed app keeps it alive) it still showed 16 Sep
// on 17 Sep, and Mark opened the day before.
//
// This hook owns the rule: the page's own date moves to today whenever the
// viewer comes back on a new day; once the viewer picks a date themselves
// (even today's), it is theirs and is never moved.

import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { format } from 'date-fns';
import { rolledOverAttendanceDate } from '@/lib/utils/academic/attendance-auto-date';

type WithDate = { attendance_date: string };

export function useAttendanceDateRollover<T extends WithDate>(
  setContext: Dispatch<SetStateAction<T>>,
) {
  // The date this page set by itself; null once the viewer has picked one.
  const autoDateRef = useRef<string | null>(null);

  /** The page sets its own date (on first load). */
  const setAutoDate = useCallback(
    (date: string) => {
      autoDateRef.current = date;
      setContext((prev) => ({ ...prev, attendance_date: date }));
    },
    [setContext],
  );

  /** The viewer picked a date (calendar, "Today"): stop moving it. */
  const markViewerChoice = useCallback(() => {
    autoDateRef.current = null;
  }, []);

  useEffect(() => {
    const onReturn = () => {
      if (document.visibilityState !== 'visible') return;
      const today = format(new Date(), 'yyyy-MM-dd');
      setContext((prev) => {
        const next = rolledOverAttendanceDate(prev.attendance_date, autoDateRef.current, today);
        if (!next) return prev;
        autoDateRef.current = next;
        return { ...prev, attendance_date: next };
      });
    };
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);
    return () => {
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
    };
  }, [setContext]);

  return { setAutoDate, markViewerChoice };
}
