'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BeatLoader } from 'react-spinners';
import {
  CalendarDays,
  Clock,
  User,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import { usePendingSessions } from '@/hooks/use-session-feedback';
import type { PendingSession } from '@/types/session-feedback';
import { FeedbackDialog } from './_components/feedback-dialog';

const BRAND = '#0b6d41';

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function formatTime(t: string | null): string | null {
  if (!t) return null;
  // start_time may be 'HH:MM:SS' or a full timestamp — show HH:MM.
  const m = t.match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : t;
}

export default function LearnerSessionFeedbackPage() {
  const { data: pending, isLoading, isError, error } = usePendingSessions(30);
  const [activeSession, setActiveSession] = useState<PendingSession | null>(null);

  const sessions = pending ?? [];
  const pendingCount = sessions.length;

  return (
    <ContentLayout title="Class Feedback">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Academic', href: '/academic' },
          { label: 'Class Feedback' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1" style={{ color: BRAND }}>
              Class Feedback
            </h1>
            <p className="text-sm text-muted-foreground">
              A quick 10-second check after each class. Giving feedback confirms your attendance.
            </p>
          </div>
          {pendingCount > 0 && (
            <Badge className="bg-[#ffde59] text-amber-900 border-amber-300 text-sm px-3 py-1">
              {pendingCount} pending
            </Badge>
          )}
        </div>

        {/* Body */}
        <Card className="bg-[#fbfbee]/30 dark:bg-card">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center p-12">
                <BeatLoader color={BRAND} />
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <AlertCircle className="h-12 w-12 text-red-400/70 mb-4" />
                <h3 className="text-lg font-medium mb-1">Couldn&apos;t load your sessions</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  {error instanceof Error ? error.message : 'Please try again in a moment.'}
                </p>
              </div>
            ) : sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Sparkles className="h-12 w-12 mb-4" style={{ color: `${BRAND}66` }} />
                <h3 className="text-lg font-medium mb-1">You&apos;re all caught up</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  No class feedback pending. New classes will appear here right after they happen.
                </p>
              </div>
            ) : (
              <ul className="divide-y">
                {sessions.map((s) => {
                  const courseLabel = s.course_name || s.course_code || 'Class session';
                  const time = formatTime(s.start_time);
                  const periodBits = [s.period_name, time].filter(Boolean).join(' · ');
                  return (
                    <li key={`${s.attendance_date}-${s.timetable_id}-${s.period_id}`}>
                      <button
                        type="button"
                        onClick={() => setActiveSession(s)}
                        className="w-full text-left px-4 py-4 flex items-center gap-4 hover:bg-muted/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6d41]/30 focus-visible:ring-inset"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="font-medium truncate">
                            {courseLabel}
                            {s.course_code && s.course_name && (
                              <span className="ml-2 text-xs text-muted-foreground font-normal">
                                {s.course_code}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <CalendarDays className="h-3.5 w-3.5" />
                              {formatDate(s.attendance_date)}
                            </span>
                            {periodBits && (
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5" />
                                {periodBits}
                              </span>
                            )}
                            {s.faculty_name && (
                              <span className="inline-flex items-center gap-1">
                                <User className="h-3.5 w-3.5" />
                                {s.faculty_name}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="hidden sm:inline-flex items-center gap-1 text-xs font-medium" style={{ color: BRAND }}>
                          <CheckCircle2 className="h-4 w-4" />
                          Give feedback
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {pendingCount > 0 && (
          <p className="text-xs text-muted-foreground text-center">
            Tap a class to confirm — it only takes about 10 seconds.
          </p>
        )}
      </div>

      <FeedbackDialog
        session={activeSession}
        onOpenChange={(open) => {
          if (!open) setActiveSession(null);
        }}
      />
    </ContentLayout>
  );
}
