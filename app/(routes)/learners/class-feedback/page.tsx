'use client';

import { useMemo, useState } from 'react';
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
import { usePendingSessions, useConfirmationStatus } from '@/hooks/use-session-feedback';
import type { PendingSession } from '@/types/session-feedback';
import { FeedbackDialog } from './_components/feedback-dialog';
import { MyVoiceReceipt } from './_components/my-voice-receipt';
import { ClassPollBanner } from './_components/class-poll-banner';
import { LoopClosureCard } from './_components/loop-closure-card';
import { StrugglingNoteCard } from './_components/struggling-note-card';
import { MyConfirmedAttendanceCard } from '@/components/session-feedback/my-confirmed-attendance-card';

const BRAND = '#0b6d41';

// Decision #11 (2026-07-05): feedback confirms attendance ONLY within this window of the
// class. Mirrors the server-side session_feedback.window_hours default (48h). This is a
// UX hint — the confirmed-attendance fns are the source of truth for the actual count.
const CONFIRM_WINDOW_HOURS = 48;

// Interpret the class day at IST midnight (matching the server fns) and check whether the
// confirmation window is still open. Feedback for older classes is still welcome — it just
// no longer counts toward attendance, so we LABEL it rather than hide it.
function withinConfirmWindow(attendanceDate: string): boolean {
  const classMidnightIST = new Date(`${attendanceDate}T00:00:00+05:30`).getTime();
  if (Number.isNaN(classMidnightIST)) return true; // unknown date → never mislabel
  return Date.now() <= classMidnightIST + CONFIRM_WINDOW_HOURS * 3600 * 1000;
}

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
  const [activeSource, setActiveSource] = useState<'async' | 'live_poll'>('async');

  const sessions = pending ?? [];
  const pendingCount = sessions.length;

  // Confirmed-session history — absorbed from the former "My Attendance Feedback"
  // tab so this is the single feedback surface. Last 30 days, confirmed rows only
  // (pending ones already appear in the action list above). Read-only; this does
  // not touch the feedback-confirms-attendance write path.
  const { from, to } = useMemo(() => {
    const ymd = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const today = new Date();
    const start = new Date();
    start.setDate(today.getDate() - 30);
    return { from: ymd(start), to: ymd(today) };
  }, []);
  const { data: confirmRows } = useConfirmationStatus(from, to);
  const confirmed = (confirmRows ?? []).filter((r) => r.confirmed === true);

  return (
    <ContentLayout title="Class Feedback">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
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
              A quick 10-second check after each class. Give it within {CONFIRM_WINDOW_HOURS} hours to confirm your attendance.
            </p>
          </div>
          {pendingCount > 0 && (
            <Badge className="bg-[#ffde59] text-amber-900 border-amber-300 text-sm px-3 py-1">
              {pendingCount} pending
            </Badge>
          )}
        </div>

        {/* Your confirmed-attendance % + early warning (advisory; hidden when enforcement is off) */}
        <MyConfirmedAttendanceCard />

        {/* Live class poll (Live Poll Engine Phase B) — the rich builder-driven poll
            (realtime word-cloud / scale / checklist). This is now the SOLE in-class
            live surface: opening a class poll flips scf_live_pulse.is_open, so the old
            simple LivePulseBanner would double-show the same class. The old banner is
            intentionally retired here; class-poll answers still feed the SCF loop via
            the bridge (fn_induction_submit_poll_response -> fn_scf_submit_feedback). */}
        <ClassPollBanner />

        {/* A warm, private support note if you've found a course harder lately (hidden until a real AI note exists) */}
        <StrugglingNoteCard />

        {/* Loop closed — the specific change your feedback caused + your own before/after (hidden until a real chain exists) */}
        <LoopClosureCard />

        {/* Receipt — your participation + whether flagged classes improved (hidden until you have history) */}
        <MyVoiceReceipt />

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
                  // #11: past the window, feedback is still welcome but no longer confirms attendance.
                  const confirmsAttendance = withinConfirmWindow(s.attendance_date);
                  return (
                    <li key={`${s.attendance_date}-${s.timetable_id}-${s.period_id}`}>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveSource('async');
                          setActiveSession(s);
                        }}
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
                            {!confirmsAttendance && (
                              <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-500">
                                <Clock className="h-3.5 w-3.5" />
                                Too late to confirm attendance
                              </span>
                            )}
                          </div>
                        </div>
                        {confirmsAttendance ? (
                          <span className="hidden sm:inline-flex items-center gap-1 text-xs font-medium" style={{ color: BRAND }}>
                            <CheckCircle2 className="h-4 w-4" />
                            Give feedback
                          </span>
                        ) : (
                          <span className="hidden sm:inline-flex items-center gap-1 text-xs font-medium text-muted-foreground" title={`The ${CONFIRM_WINDOW_HOURS}-hour window to confirm attendance for this class has passed. Your feedback still helps your faculty, but it no longer counts toward attendance.`}>
                            Feedback only
                          </span>
                        )}
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

        {/* Confirmed-session history — folded in from the former "My Attendance
            Feedback" tab so this single page covers both what needs confirming
            (above) and what's already confirmed (here). Collapsed by default to
            keep the focus on the pending action. */}
        {confirmed.length > 0 && (
          <details className="rounded-lg border bg-card">
            <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-3 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4" style={{ color: BRAND }} />
              Confirmed this month
              <span className="font-normal text-muted-foreground">
                ({confirmed.length})
              </span>
            </summary>
            <ul className="divide-y border-t">
              {confirmed.map((r) => {
                const label =
                  r.course_code && r.course_name
                    ? `${r.course_code} — ${r.course_name}`
                    : r.course_name || r.course_code || 'Class session';
                return (
                  <li
                    key={`${r.attendance_date}-${r.timetable_id}-${r.period_id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(r.attendance_date)}
                      </p>
                    </div>
                    <Badge variant="success" className="shrink-0 gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Confirmed
                    </Badge>
                  </li>
                );
              })}
            </ul>
          </details>
        )}
      </div>

      <FeedbackDialog
        session={activeSession}
        source={activeSource}
        onOpenChange={(open) => {
          if (!open) setActiveSession(null);
        }}
      />
    </ContentLayout>
  );
}
