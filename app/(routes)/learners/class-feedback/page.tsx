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
  HelpCircle,
} from 'lucide-react';
import {
  usePendingSessions,
  useConfirmationStatus,
  useFeedbackWindowHours,
} from '@/hooks/use-session-feedback';
import type { PendingSession } from '@/types/session-feedback';
import { FeedbackDialog } from './_components/feedback-dialog';
import { MyVoiceReceipt } from './_components/my-voice-receipt';
import { ClassPollBanner } from './_components/class-poll-banner';
import { PreSessionMaterialsRow } from './_components/pre-session-materials-row';
import { LoopClosureCard } from './_components/loop-closure-card';
import { VoiceChangedTermly } from './_components/voice-changed-termly';
import { StrugglingNoteCard } from './_components/struggling-note-card';
import { MyConfirmedAttendanceCard } from '@/components/session-feedback/my-confirmed-attendance-card';

const BRAND = '#0b6d41';

// Nav label override read by scripts/generate-route-manifest.ts — renames the
// auto-generated tab-strip / manifest label to the JKKN house term
// "Learning Studio Feedback" (the URL stays /learners/class-feedback).
export const navMeta = { label: 'Learning Studio Feedback' };

// Two-sided 48h window (Director, 2026-07-08): feedback CLOSES window_hours after
// the class — past the window, submission is rejected by fn_scf_submit_feedback and
// the session no longer appears in the pending list. The hours come from the shared
// session_feedback.window_hours config lever (useFeedbackWindowHours); this default
// only covers the moment before the config read resolves.
const DEFAULT_WINDOW_HOURS = 48;

// Interpret the class day at IST midnight (matching the server fns) and check whether
// the feedback window is still open. Expired sessions normally never reach this page
// (fn_scf_pending_for_learner filters them) — this is a race-guard for a session that
// expires while the page is open.
function withinFeedbackWindow(attendanceDate: string, windowHours: number): boolean {
  const classMidnightIST = new Date(`${attendanceDate}T00:00:00+05:30`).getTime();
  if (Number.isNaN(classMidnightIST)) return true; // unknown date → never mislabel
  return Date.now() <= classMidnightIST + windowHours * 3600 * 1000;
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
  const { data: configWindowHours } = useFeedbackWindowHours();
  const windowHours = configWindowHours ?? DEFAULT_WINDOW_HOURS;
  const [activeSession, setActiveSession] = useState<PendingSession | null>(null);
  const [activeSource, setActiveSource] = useState<'async' | 'live_poll'>('async');

  const sessions = pending ?? [];
  const pendingCount = sessions.length;

  // Attended-session history — absorbed from the former "My Attendance Feedback"
  // tab so this is the single feedback surface. Last 30 days, every Present session
  // (each badged confirmed / not-yet-confirmed below). Read-only; this does not
  // touch the feedback-confirms-attendance write path.
  const { from, to } = useMemo(() => {
    const ymd = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const today = new Date();
    const start = new Date();
    start.setDate(today.getDate() - 30);
    return { from: ymd(start), to: ymd(today) };
  }, []);
  // Show EVERY attended session this month (confirmed + not-yet-confirmed), not
  // only the confirmed subset — a learner who attended 64 must see 64 with badges,
  // not just the 51 they've given feedback for (root cause of the BUG-004636/637
  // "shows 51/42 classes" cluster). fn_scf_confirmation_status already returns one
  // row per Present session with a `confirmed` flag, so no RPC change is needed.
  const { data: confirmRows } = useConfirmationStatus(from, to);
  // Block-course consolidation for the history badges (mirrors the
  // fn_scf_pending_for_learner fix of 2026-07-18): fn_scf_confirmation_status
  // still matches confirmed-vs-not by exact period_id only, so a learner who
  // gave feedback for one period of a block-scheduled course still saw sibling
  // periods of that same course/day badged "Not yet confirmed"
  // (BUG-004651/690/707/728/741/814). Group by (date, course_code) — the only
  // course key this RPC exposes — same conservative pattern already used by
  // period-wise-table.tsx's pendingCourseKeys.
  const historyRows = useMemo(() => {
    const rows = confirmRows ?? [];
    const confirmedKeys = new Set(
      rows
        .filter((r) => r.confirmed && r.course_code)
        .map((r) => `${r.attendance_date}__${r.course_code}`)
    );
    return rows.map((r) =>
      !r.confirmed && r.course_code && confirmedKeys.has(`${r.attendance_date}__${r.course_code}`)
        ? { ...r, confirmed: true }
        : r
    );
  }, [confirmRows]);
  const confirmedCount = historyRows.filter((r) => r.confirmed === true).length;

  return (
    <ContentLayout title="Learning Studio Feedback">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learning Studio Feedback' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1" style={{ color: BRAND }}>
              Learning Studio Feedback
            </h1>
            <p className="text-sm text-muted-foreground">
              A quick 10-second check after each class. Give it within {windowHours} hours — after
              that the window closes and feedback can no longer be given.
            </p>
            {/* The two-contract declaration (Director, 8 Jul): say BOTH promises openly.
                Anonymity is about what the FACILITATOR sees; personalisation is what the
                SYSTEM does for the learner. Keeping them side by side is what makes the
                personalised follow-ups below feel like service, not surveillance. */}
            <p className="mt-1.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Anonymous to your facilitator</span> — your
              ratings only ever appear in groups of 3 or more, never with your name.{' '}
              <span className="font-medium text-foreground">Personalised for you</span> — MyJKKN reads
              your own answers to support your learning; your facilitator never sees them with your
              name on it.
            </p>
          </div>
          {pendingCount > 0 && (
            <Badge className="bg-[#ffde59] text-amber-900 border-amber-300 text-sm px-3 py-1">
              {pendingCount} pending
            </Badge>
          )}
        </div>

        {/* "How it works" — one consolidated, revisitable explainer so a learner
            can understand the feature AND explain it to a peer. The page header +
            in-dialog notes already say pieces of this; this collapses the full
            purpose + who-sees-it + step-by-step how into one place they can reopen
            anytime. Native <details> — no extra state, SSR-safe. Addresses the
            "learners can't use/explain the feedback feature" concern (2026-07-24). */}
        <details className="group rounded-lg border bg-muted/30 px-4 py-3 text-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-medium">
            <span className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4 shrink-0" style={{ color: BRAND }} />
              How this works — and why it&apos;s worth 10 seconds
            </span>
            <span className="text-xs text-muted-foreground group-open:hidden">Show</span>
            <span className="hidden text-xs text-muted-foreground group-open:inline">Hide</span>
          </summary>
          <div className="mt-3 space-y-2.5 text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">What it is.</span> After a class you
              attended, a 10-second check-in: how well you followed, and what happened in class.
            </p>
            <p>
              <span className="font-medium text-foreground">Why it matters.</span> It confirms your
              attendance for that class, and it tells MyJKKN — privately — where you need help before
              the next one.
            </p>
            <p>
              <span className="font-medium text-foreground">Who sees it.</span> Your facilitator sees
              ratings only in groups of 3 or more, never with your name. MyJKKN uses your own answers
              to support your learning.
            </p>
            <p>
              <span className="font-medium text-foreground">How to give it.</span> Open a pending
              class → tap how clear it was (1–5) → tick what happened → add a note if you want →{' '}
              <span className="font-medium text-foreground">Submit</span>. That confirms your
              attendance.
            </p>
            <p>
              <span className="font-medium text-foreground">Time limit.</span> Give it within{' '}
              {windowHours} hours of the class — after that the window closes.
            </p>
          </div>
        </details>

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

        {/* The termly ledger — the whole history of changes your voice caused, by
            academic year, with your own word on each. Collapsed by default and it
            only fetches once opened, so it never competes with the pending list
            above; the live card above stays the place the answer is ASKED for. */}
        <VoiceChangedTermly />

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
                {/* Honest timing copy (BUG-004739 group, 2026-07-19): a class can only
                    appear here AFTER its attendance is marked, which is often hours
                    after the class ends — "right after they happen" taught learners
                    to expect the just-finished class and report the gap as a bug. */}
                <p className="text-sm text-muted-foreground max-w-md">
                  No class feedback pending right now. A class appears here once its
                  attendance has been marked — that can be a little while after the
                  class ends, so check back if a class you just attended isn&apos;t
                  listed yet.
                </p>
              </div>
            ) : (
              <ul className="divide-y">
                {sessions.map((s) => {
                  const courseLabel = s.course_name || s.course_code || 'Class session';
                  const time = formatTime(s.start_time);
                  const periodBits = [s.period_name, time].filter(Boolean).join(' · ');
                  // Two-sided 48h window: past the window the submit RPC rejects, so the
                  // row is disabled with an explicit label (race-guard — the server stops
                  // listing expired sessions, so this normally never renders).
                  const windowOpen = withinFeedbackWindow(s.attendance_date, windowHours);
                  return (
                    <li key={`${s.attendance_date}-${s.timetable_id}-${s.period_id}`}>
                      <button
                        type="button"
                        disabled={!windowOpen}
                        onClick={() => {
                          if (!windowOpen) return;
                          setActiveSource('async');
                          setActiveSession(s);
                        }}
                        className="w-full text-left px-4 py-4 flex items-center gap-4 hover:bg-muted/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6d41]/30 focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:bg-transparent"
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
                            {!windowOpen && (
                              <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-500">
                                <Clock className="h-3.5 w-3.5" />
                                Feedback window closed
                              </span>
                            )}
                          </div>
                        </div>
                        {windowOpen ? (
                          <span className="hidden sm:inline-flex items-center gap-1 text-xs font-medium" style={{ color: BRAND }}>
                            <CheckCircle2 className="h-4 w-4" />
                            Give feedback
                          </span>
                        ) : (
                          <span className="hidden sm:inline-flex items-center gap-1 text-xs font-medium text-muted-foreground" title={`The ${windowHours}-hour feedback window for this class has closed — feedback can no longer be given for it.`}>
                            Window closed
                          </span>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </button>
                      <PreSessionMaterialsRow session={s} />
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Always-on timing hint: the 07-14 morning reporters had items pending yet
            reported "can't submit" because the class they'd JUST attended wasn't
            marked yet — so this line must show even when the list is non-empty. */}
        <p className="text-xs text-muted-foreground text-center">
          {pendingCount > 0 && (
            <>Tap a class to confirm — it only takes about 10 seconds. </>
          )}
          A class you just attended appears here once its attendance is marked.
        </p>

        {/* Your attended classes this month — EVERY Present session, each badged
            Confirmed (feedback given in time) or Not yet confirmed (attended, no
            feedback). Showing the full list — not only the confirmed subset — lets
            a learner see their real attendance total and exactly which classes are
            still missing feedback. Missing feedback never counts you absent. */}
        {historyRows.length > 0 && (
          <details className="rounded-lg border bg-card">
            <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-3 text-sm font-medium">
              <CalendarDays className="h-4 w-4" style={{ color: BRAND }} />
              Your classes this month
              <span className="font-normal text-muted-foreground">
                ({historyRows.length})
              </span>
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                {confirmedCount} of {historyRows.length} confirmed with feedback
              </span>
            </summary>
            <p className="border-t px-4 py-2 text-xs text-muted-foreground">
              Every class you attended this month. &ldquo;Confirmed&rdquo; means you also gave
              feedback within the window — you&apos;re never counted absent for missing feedback.
              Once a class&apos;s window has closed it can no longer be confirmed — that&apos;s
              normal and never counts against your attendance.
            </p>
            <ul className="divide-y border-t">
              {historyRows.map((r) => {
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
                    {r.confirmed ? (
                      <Badge variant="success" className="shrink-0 gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Confirmed
                      </Badge>
                    ) : withinFeedbackWindow(r.attendance_date, windowHours) ? (
                      // "Not yet confirmed" read as a rejection/error to reporters
                      // (BUG-005050/051/052/053/055/058/061) despite being a neutral
                      // status — the window is still open and feedback can still be
                      // given from the list above. "Feedback pending" matches the
                      // page's own "pending" vocabulary (header badge, intro line)
                      // instead of the negatively-framed "Not ___" wording.
                      <Badge
                        variant="secondary"
                        className="shrink-0 gap-1 text-muted-foreground"
                        title="Not an error — you just haven't given feedback for this class yet. Find it in the list above and tap it to give feedback now."
                      >
                        <Clock className="h-3.5 w-3.5" />
                        Feedback pending
                      </Badge>
                    ) : (
                      /* Window expired: "Not yet confirmed" reads as actionable, but
                         nothing can clear it any more (submit RPC rejects past the
                         window) — reporters carried 8–56 of these badges and filed
                         them as "can't submit feedback". Say the true state instead. */
                      <Badge
                        variant="outline"
                        className="shrink-0 gap-1 text-muted-foreground"
                        title={`The ${windowHours}-hour feedback window for this class has closed — it can no longer be confirmed. This never counts you absent.`}
                      >
                        <Clock className="h-3.5 w-3.5" />
                        Window closed
                      </Badge>
                    )}
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
        // Decoy pool for the occasional attention check (Director, 2026-07-09):
        // ~1-in-7 opens ask "which class is this?" using the OTHER pending
        // course labels; skipped under 3 distinct pending courses. Client-only.
        pendingSessions={sessions}
        onOpenChange={(open) => {
          if (!open) setActiveSession(null);
        }}
      />
    </ContentLayout>
  );
}
