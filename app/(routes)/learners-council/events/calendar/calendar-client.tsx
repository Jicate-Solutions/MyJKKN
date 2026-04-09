'use client';

/**
 * LC-003: Event Calendar - Div-based month grid with event pills
 * No external calendar library — pure CSS grid
 */

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  ArrowLeft,
} from 'lucide-react';
import { useEventsByDateRange } from '@/hooks/learners-council/use-lc-events';
import type { LCEvent } from '@/types/learners-council';

interface CalendarClientProps {
  initialEvents: LCEvent[];
  initialYear: number;
  initialMonth: number;
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const statusColors: Record<string, string> = {
  pending_review: 'bg-yellow-400',
  approved: 'bg-green-400',
  published: 'bg-blue-500',
  in_progress: 'bg-indigo-500',
  completed: 'bg-gray-400',
};

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDay.getDay(); // 0=Sun
  const totalDays = lastDay.getDate();

  const days: { date: number; isCurrentMonth: boolean; dateObj: Date }[] = [];

  // Previous month trailing days
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const d = prevMonthLastDay - i;
    days.push({
      date: d,
      isCurrentMonth: false,
      dateObj: new Date(year, month - 1, d),
    });
  }

  // Current month days
  for (let d = 1; d <= totalDays; d++) {
    days.push({
      date: d,
      isCurrentMonth: true,
      dateObj: new Date(year, month, d),
    });
  }

  // Next month leading days to fill the grid
  const remaining = 42 - days.length; // 6 rows x 7 cols
  for (let d = 1; d <= remaining; d++) {
    days.push({
      date: d,
      isCurrentMonth: false,
      dateObj: new Date(year, month + 1, d),
    });
  }

  return days;
}

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();
}

function EventPill({ event }: { event: LCEvent }) {
  const colorClass = statusColors[event.status] || 'bg-gray-400';

  return (
    <Link
      href={`/learners-council/events/${event.id}`}
      className="block truncate text-xs px-1.5 py-0.5 rounded-sm text-white hover:opacity-80 transition-opacity"
      style={{ maxWidth: '100%' }}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${colorClass} mr-1`} />
      <span className="truncate">{event.title}</span>
    </Link>
  );
}

export function CalendarClient({
  initialEvents,
  initialYear,
  initialMonth,
}: CalendarClientProps) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);

  const startOfMonth = new Date(year, month, 1).toISOString();
  const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

  // Use React Query for fetching when navigating months
  const isInitialMonth = year === initialYear && month === initialMonth;
  const { data: fetchedEvents } = useEventsByDateRange(
    startOfMonth,
    endOfMonth,
    undefined,
  );

  const events = isInitialMonth ? initialEvents : (fetchedEvents || []);

  const days = useMemo(() => getMonthDays(year, month), [year, month]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, LCEvent[]>();
    events.forEach((event: any) => {
      const date = new Date(event.starts_at);
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(event);
    });
    return map;
  }, [events]);

  const today = new Date();

  const goToPrev = () => {
    if (month === 0) {
      setYear(year - 1);
      setMonth(11);
    } else {
      setMonth(month - 1);
    }
  };

  const goToNext = () => {
    if (month === 11) {
      setYear(year + 1);
      setMonth(0);
    } else {
      setMonth(month + 1);
    }
  };

  const goToToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  };

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/learners-council/events"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Events
          </Link>
          <h1 className="text-2xl font-bold">Event Calendar</h1>
          <p className="text-sm text-muted-foreground">
            View Learners Council events by month
          </p>
        </div>
      </div>

      {/* Calendar Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="icon" onClick={goToPrev}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <CardTitle className="text-lg min-w-[180px] text-center">
                {MONTH_NAMES[month]} {year}
              </CardTitle>
              <Button variant="outline" size="icon" onClick={goToNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={goToToday}>
              Today
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS_OF_WEEK.map((day) => (
              <div
                key={day}
                className="text-center text-xs font-medium text-muted-foreground py-2"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 border-t border-l">
            {days.map((day, idx) => {
              const dateKey = `${day.dateObj.getFullYear()}-${day.dateObj.getMonth()}-${day.dateObj.getDate()}`;
              const dayEvents = eventsByDate.get(dateKey) || [];
              const isToday = isSameDay(day.dateObj, today);

              return (
                <div
                  key={idx}
                  className={`min-h-[100px] border-r border-b p-1 ${
                    day.isCurrentMonth ? 'bg-background' : 'bg-muted/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-xs font-medium inline-flex items-center justify-center h-6 w-6 rounded-full ${
                        isToday
                          ? 'bg-primary text-primary-foreground'
                          : day.isCurrentMonth
                            ? 'text-foreground'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {day.date}
                    </span>
                    {dayEvents.length > 2 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{dayEvents.length - 2}
                      </span>
                    )}
                  </div>
                  <div className="space-y-0.5 overflow-hidden">
                    {dayEvents.slice(0, 2).map((event: any) => (
                      <EventPill key={event.id} event={event} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="font-medium">Status:</span>
        {Object.entries(statusColors).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
            <span>{status.replace(/_/g, ' ')}</span>
          </div>
        ))}
      </div>

      {/* Events list for current month */}
      {events.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Events in {MONTH_NAMES[month]} ({events.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {events.map((event: any) => {
                const statusColor = statusColors[event.status] || 'bg-gray-400';
                return (
                  <Link
                    key={event.id}
                    href={`/learners-council/events/${event.id}`}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <span className={`h-3 w-3 rounded-full flex-shrink-0 ${statusColor}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{event.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(event.starts_at).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                        })}{' '}
                        {new Date(event.starts_at).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {event.venue_name && ` - ${event.venue_name}`}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs flex-shrink-0">
                      {event.scope?.replace(/_/g, ' ')}
                    </Badge>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
