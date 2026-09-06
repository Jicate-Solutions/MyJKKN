'use client';

// Faculty session feedback — two views:
//  1) COMPLETION (coverage): how many of the Present students confirmed each
//     session (fn_scf_faculty_completion) + a "who hasn't submitted" roster
//     (fn_scf_faculty_pending_roster — identity ONLY, never feedback content).
//  2) UNDERSTANDING (quality): anonymized aggregate signal (fn_scf_faculty_summary).
// Spec: specs/session-feedback-faculty-completion-lane-2026-06-17.md (A — visibility).

import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { format, subDays } from 'date-fns';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';
import {
  MessageSquare,
  ShieldCheck,
  AlertTriangle,
  Users,
  ClipboardCheck,
  Clock,
  CheckCircle2,
  RotateCcw,
  BellRing,
  Lock,
  BookOpen,
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  useFacultyFeedbackSummary,
  useFacultyCompletion,
  useSessionPendingRoster,
  useFacultyFollowups,
  useNotifySessionPending,
} from '@/hooks/use-session-feedback';
import type {
  FacultySummaryRow,
  FacultyCompletionRow,
  FacultyFollowupRow,
} from '@/types/session-feedback';
import { FollowupCell } from '../_components/followup-cell';
import { AiSuggestionDialog } from '../_components/ai-suggestion-dialog';
import { AiTaskButton } from '@/components/ai-tasks/ai-task-button';
import { LivePulseSection } from '../_components/live-pulse-control';
import { PreSessionMaterialsControl } from '../_components/pre-session-materials-control';
import { MyLoopNotesCard } from '../_components/my-loop-notes-card';
import { MyPulseCard } from '../_components/my-pulse-card';
import { FreetextCarryCountsCard } from '../_components/freetext-carry-counts-card';
import { ClarificationAsksCard } from '../_components/clarification-asks-card';
import {
  UnderstandingBand,
  understandingLevel,
  type UnderstandingLevel,
} from '@/components/session-feedback/understanding-band';

const BRAND_GREEN = '#0b6d41';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : format(d, 'd MMM yyyy');
}

// ── Understanding (quality) — banded display (anti-gaming: never the raw number) ──
const BAND_BAR: Record<'good' | 'warn' | 'bad' | 'none', string> = {
  good: 'bg-green-500',
  warn: 'bg-amber-500',
  bad: 'bg-red-500',
  none: 'bg-muted-foreground/30',
};

const BAND_BADGE: Record<'good' | 'warn' | 'bad' | 'none', string> = {
  good: 'bg-green-100 text-green-800 border-green-200',
  warn: 'bg-amber-100 text-amber-800 border-amber-200',
  bad: 'bg-red-100 text-red-800 border-red-200',
  none: 'bg-muted text-muted-foreground border-border',
};

// Understanding is shown as a qualitative band (Strong / Mixed / Low) + colour bar,
// never the raw average — see components/session-feedback/understanding-band.tsx.
function UnderstandingCell({ avg }: { avg: number | null }) {
  return <UnderstandingBand avg={avg} />;
}

// ── Completion (coverage) ────────────────────────────────────────────────────
function completionBand(pct: number, present: number): 'good' | 'warn' | 'bad' | 'none' {
  if (present === 0) return 'none';
  if (pct >= 100) return 'good';
  if (pct > 0) return 'warn';
  return 'bad';
}

function CompletionCell({ row }: { row: FacultyCompletionRow }) {
  const band = completionBand(row.completion_pct, row.present_count);
  const pct = Math.max(0, Math.min(100, row.completion_pct));
  return (
    <div className="flex items-center gap-2">
      <span className="tabular-nums font-medium">
        {row.confirmed_count}/{row.present_count}
      </span>
      <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${BAND_BAR[band]}`} style={{ width: `${pct}%` }} />
      </div>
      <Badge variant="outline" className={BAND_BADGE[band]}>
        {pct}%
      </Badge>
    </div>
  );
}

/** Drawer of Present students who haven't submitted. Lazy — only fetches when opened.
 *  Shows identity (name + register) ONLY; the RPC never returns feedback content. */
function PendingRosterDialog({ row }: { row: FacultyCompletionRow }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError, error } = useSessionPendingRoster(
    row.attendance_date,
    row.timetable_id,
    row.period_id,
    open,
  );
  const roster = data ?? [];

  // PR-B — faculty-triggered "notify pending" (reuses the nudge notification path).
  const notify = useNotifySessionPending();
  async function handleNotify() {
    try {
      const n = await notify.mutateAsync({
        attendanceDate: row.attendance_date,
        timetableId: row.timetable_id,
        periodId: row.period_id,
      });
      // n = learners NEWLY reminded — only those with an app account who weren't already
      // reminded today. It is NOT comparable to roster.length (which counts all pending
      // identities, including those without accounts or already reminded), so we don't
      // present a possibly-misleading "n of roster.length" fraction. Label honestly on
      // the count actually sent.
      if (n > 0) {
        toast.success(
          `Reminder sent to ${n} pending learner${n === 1 ? '' : 's'}. ` +
            `Learners already reminded today, or without an app account yet, are not re-sent.`,
        );
      } else {
        toast.info(
          'No new reminders sent — these learners were already reminded today or have no app account yet.',
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send reminders.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={row.pending_count === 0}>
          <Users className="mr-1.5 h-3.5 w-3.5" />
          {row.pending_count === 0 ? 'All in' : `${row.pending_count} pending`}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Who hasn&apos;t submitted — {row.course_code ?? 'Session'}
          </DialogTitle>
          <DialogDescription>
            {formatDate(row.attendance_date)} · {row.pending_count} pending. You can see{' '}
            <strong>who</strong>{' '}hasn&apos;t submitted — never <strong>what</strong>{' '}anyone said.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <BeatLoader color={BRAND_GREEN} size={8} />
          </div>
        ) : isError ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {error instanceof Error ? error.message : 'Could not load the pending list.'}
            </AlertDescription>
          </Alert>
        ) : roster.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <CheckCircle2 className="h-9 w-9 text-green-500" />
            <p className="text-sm font-medium">Everyone has submitted.</p>
          </div>
        ) : (
          <>
            <ul className="max-h-72 divide-y overflow-y-auto rounded-md border">
              {roster.map((s, i) => (
                <li key={`${s.register_number ?? ''}-${i}`} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="font-medium">{s.student_name ?? '—'}</span>
                  <span className="tabular-nums text-muted-foreground">{s.register_number ?? ''}</span>
                </li>
              ))}
            </ul>
            <Button
              type="button"
              onClick={handleNotify}
              disabled={notify.isPending}
              className="mt-1 w-full bg-[#0b6d41] hover:bg-[#0b6d41]/90"
            >
              {notify.isPending ? (
                <BeatLoader color="#ffffff" size={6} />
              ) : (
                <>
                  <BellRing className="mr-1.5 h-4 w-4" />
                  Remind pending learners
                </>
              )}
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              Sends a one-tap in-app reminder to confirm — only to learners with an app
              account, once per learner per day.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Topics to revisit (B1) ───────────────────────────────────────────────────
// The teacher's OWN low-understanding sessions + the lift (did the next session of
// the same course recover?) + a per-topic "AI suggested fix". Self-scoped clone of
// the principal escalation lift — the signal finally lands on the teacher's desk.
function TopicsToRevisitSection({ from, to }: { from: string; to: string }) {
  const { data, isLoading, isError, error } = useFacultyFollowups(from, to);
  // The RPC already returns worst-first (lowest avg, most recent).
  const rows: FacultyFollowupRow[] = data ?? [];

  // P2 deep-link: the "AI result ready" notification links here with ?course=<code>.
  // Derive it from the URL, scroll the matching row into view, and tell that
  // course's button to open its popover (autoOpen prop below).
  const deepCourse = useSearchParams().get('course');
  // Deep-link handler: once the list has loaded, scroll to the target course —
  // or, if it isn't in this list (this table only shows the last 30 days of
  // low-understanding sessions, so an empty/failed deep-link or an aged-out
  // class won't have a row), tell the user WHY instead of silently doing
  // nothing. Non-actionable by design: the window is fixed (no date picker), so
  // the notice states the fact rather than promising a control. `id` dedupes.
  useEffect(() => {
    if (!deepCourse || isLoading) return;
    const el = document.querySelector(`[data-course-anchor="${CSS.escape(deepCourse)}"]`);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    toast.info(
      "This class isn't in your low-understanding list right now, so its AI summary isn't shown here.",
      { id: `deeplink-miss-${deepCourse}` },
    );
  }, [deepCourse, isLoading, rows.length]);
  // A course can span several session rows; open the popover on the FIRST match
  // only (scrollIntoView above already lands on the first anchor).
  const firstDeepIdx = deepCourse ? rows.findIndex((r) => r.course_code === deepCourse) : -1;

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center gap-2">
          <RotateCcw className="h-5 w-5" style={{ color: BRAND_GREEN }} />
          <CardTitle>Topics to revisit</CardTitle>
        </div>
        <CardDescription>
          Your sessions where learners reported low understanding (average under 3, at
          least 3 responses). <span className="font-medium">Follow-up</span> shows whether
          understanding recovered the next time you taught that course — and you can ask
          for an AI-suggested fix for any topic.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <BeatLoader color={BRAND_GREEN} size={10} />
            <p className="text-sm text-muted-foreground">Loading your topics…</p>
          </div>
        ) : isError ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {error instanceof Error
                ? error.message
                : 'Could not load your topics to revisit. Please try again.'}
            </AlertDescription>
          </Alert>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-500/70" />
            <p className="text-sm font-medium">Nothing to revisit right now.</p>
            <p className="text-xs text-muted-foreground">
              None of your recent sessions scored low on understanding. Topics appear here
              when a class reports they didn&apos;t follow along.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead className="text-right">Responses</TableHead>
                  <TableHead className="text-right">Avg understood</TableHead>
                  <TableHead className="text-right">Low</TableHead>
                  <TableHead className="text-right">Follow-up</TableHead>
                  <TableHead className="text-right">Fix</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, idx) => (
                  <TableRow
                    key={`${r.attendance_date}-${r.period_id}-${r.course_code ?? 'na'}`}
                    data-course-anchor={r.course_code ?? ''}
                  >
                    <TableCell className="whitespace-nowrap font-medium">
                      {formatDate(r.attendance_date)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{r.course_code ?? 'Unspecified'}</span>
                        {r.course_name ? (
                          <span className="text-xs text-muted-foreground">
                            {r.course_name}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.responses}</TableCell>
                    <TableCell className="text-right">
                      <UnderstandingBand avg={r.avg_understood} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className={BAND_BADGE.bad}>
                        {r.low_understanding}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <FollowupCell row={r} />
                    </TableCell>
                    <TableCell className="text-right">
                      {r.course_code ? (
                        <div className="flex flex-col items-end gap-1.5">
                          <AiSuggestionDialog
                            courseCode={r.course_code}
                            courseName={r.course_name}
                            from={from}
                            to={to}
                          />
                          <AiTaskButton
                            taskType="session_feedback.suggest_improvement"
                            entityId={r.course_code}
                            label="Summarise (50% AI)"
                            autoOpen={idx === firstDeepIdx}
                          />
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// PR-C — DERIVED hard-gate status. The 'incomplete' badge only ever renders when a
// college has been flipped to gate_mode='hard' (dark by default), so this branch is
// inert until the config flip. Never blocks anything itself — it surfaces the status
// the hard gate assigns to sessions with pending feedback.
function SessionStatusBadge({ status }: { status?: string | null }) {
  switch (status) {
    case 'incomplete':
      return (
        <Badge variant="outline" className="border-red-200 bg-red-100 text-red-800">
          <Lock className="mr-1 h-3 w-3" />
          Incomplete
        </Badge>
      );
    case 'complete':
      return (
        <Badge variant="outline" className={BAND_BADGE.good}>
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Complete
        </Badge>
      );
    case 'overdue':
      return (
        <Badge variant="outline" className={BAND_BADGE.bad}>
          Overdue
        </Badge>
      );
    case 'open':
      return (
        <Badge variant="outline" className="border-border text-muted-foreground">
          <Clock className="mr-1 h-3 w-3" />
          Open
        </Badge>
      );
    default:
      return <span className="text-muted-foreground">—</span>;
  }
}

// ── Understanding by course — honest per-course band summary (D2/D4, 2026-07-24) ──
// Summary counterpart to "Topics to revisit". Driven ENTIRELY by the already-loaded
// fn_scf_faculty_summary rows — no new RPC, no new table. Shows each course the
// facilitator taught in the window as its OWN band (never a raw number — Director
// 2026-07-06 Goodhart rule), weakest first. Honest-first (D2): it never praises over
// zero Strong courses; it states the real picture + a concrete next step. Courses with
// no qualifying feedback show "No feedback yet" rather than a fabricated band.
const SCF_MIN_RESPONSES = 3; // module-wide k>=3 floor (pulse / notes / carry-forward all use 3)

type CourseRollup = {
  code: string | null;
  name: string | null;
  totalSessions: number;
  qualifyingSessions: number; // sessions with >= SCF_MIN_RESPONSES responses
  respSum: number;
  weightedSum: number;
  lowSum: number;
  avg: number | null; // internal only — NEVER rendered (bands-only rule)
  level: UnderstandingLevel;
  hasFeedback: boolean;
};

function PerCourseUnderstandingCard({ rows }: { rows: FacultySummaryRow[] }) {
  const courses = useMemo<CourseRollup[]>(() => {
    const map = new Map<string, Omit<CourseRollup, 'avg' | 'level' | 'hasFeedback'>>();
    for (const r of rows) {
      const key = r.course_code ?? '__unspecified__';
      const g =
        map.get(key) ?? {
          code: r.course_code,
          name: r.course_name,
          totalSessions: 0,
          qualifyingSessions: 0,
          respSum: 0,
          weightedSum: 0,
          lowSum: 0,
        };
      g.totalSessions += 1;
      // D3: a session enters the understanding tally only at >= 3 responses. Below the
      // floor there is no reliable signal — a lone "5" is not a Strong class, and a
      // 0-response session is not "zero low understanding". Such sessions still appear
      // in the coverage + detail tables; they simply don't earn a band here.
      if (r.responses >= SCF_MIN_RESPONSES) {
        g.qualifyingSessions += 1;
        g.lowSum += r.low_understanding;
        if (r.avg_understood != null && !Number.isNaN(r.avg_understood)) {
          g.respSum += r.responses;
          g.weightedSum += r.avg_understood * r.responses;
        }
      }
      map.set(key, g);
    }
    const order: Record<UnderstandingLevel, number> = { low: 0, mixed: 1, strong: 2, none: 3 };
    return Array.from(map.values())
      .map((g): CourseRollup => {
        const avg = g.respSum > 0 ? g.weightedSum / g.respSum : null;
        return {
          ...g,
          avg,
          level: avg != null ? understandingLevel(avg) : 'none',
          hasFeedback: g.qualifyingSessions > 0,
        };
      })
      // Weakest band first among courses with feedback (what needs attention rises to the
      // top); courses with no qualifying feedback sink to the bottom.
      .sort((a, b) => {
        if (a.hasFeedback !== b.hasFeedback) return a.hasFeedback ? -1 : 1;
        if (order[a.level] !== order[b.level]) return order[a.level] - order[b.level];
        return (a.code ?? '').localeCompare(b.code ?? '');
      });
  }, [rows]);

  // No sessions at all in range → the tables below already say "nothing yet".
  if (courses.length === 0) return null;

  const withFeedback = courses.filter((c) => c.hasFeedback);
  const strongCount = withFeedback.filter((c) => c.level === 'strong').length;
  const weakest = withFeedback.length > 0 ? withFeedback[0] : null; // sorted weakest-first

  // Honest-first headline (D2): never praise over zero Strong; always state the real
  // picture + a concrete next step.
  let headline: ReactNode;
  if (withFeedback.length === 0) {
    headline = (
      <>
        None of your courses have enough feedback yet — a course appears here once at
        least <strong>3 learners</strong> have responded. Keep marking attendance so
        learners get the feedback prompt.
      </>
    );
  } else if (strongCount === 0) {
    headline = (
      <>
        No course is reading <strong>Strong</strong> yet this month. Start with{' '}
        <strong>{weakest?.name ?? weakest?.code ?? 'your lowest course'}</strong> — the
        AI-suggested fix under <em>Topics to revisit</em> below is a good next step.
      </>
    );
  } else {
    const needs = withFeedback.length - strongCount;
    headline = (
      <>
        <strong>{strongCount}</strong> of your <strong>{withFeedback.length}</strong>{' '}
        {withFeedback.length === 1 ? 'course' : 'courses'} with feedback{' '}
        {strongCount === 1 ? 'is' : 'are'} reading <strong>Strong</strong>
        {needs > 0 ? (
          <>
            {' '}
            · <strong>{needs}</strong> still {needs === 1 ? 'needs' : 'need'} a look.
          </>
        ) : (
          <> — every course with feedback is Strong.</>
        )}
      </>
    );
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" style={{ color: BRAND_GREEN }} />
          <CardTitle>Understanding by course</CardTitle>
        </div>
        <CardDescription>{headline}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y rounded-md border">
          {courses.map((c) => (
            <li
              key={c.code ?? '__unspecified__'}
              className="flex items-center justify-between gap-3 px-3 py-2.5"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium">
                  {c.code ?? 'Unspecified course'}
                </span>
                {c.name ? (
                  <span className="truncate text-xs text-muted-foreground">{c.name}</span>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {c.hasFeedback && c.lowSum > 0 ? (
                  <span className="text-xs text-muted-foreground">{c.lowSum} low</span>
                ) : null}
                {c.hasFeedback ? (
                  <UnderstandingBand avg={c.avg} />
                ) : (
                  <span className="text-xs text-muted-foreground">No feedback yet</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function CompletionSection({ from, to }: { from: string; to: string }) {
  const { data, isLoading, isError, error } = useFacultyCompletion(from, to);
  const rows: FacultyCompletionRow[] = data ?? [];
  // Hard-gate is active only when a session's resolved gate_mode is 'hard' (dark by
  // default). When active, sessions with pending feedback are marked Incomplete.
  const hardActive = rows.some((r) => r.gate_mode === 'hard');
  const incompleteCount = rows.filter((r) => r.session_status === 'incomplete').length;
  // B1 honesty (2026-07-24): "All your sessions are complete" was claimed whenever no
  // session carried the hard-gate `incomplete` status — but Overdue/Open sessions
  // (pending feedback, a DIFFERENT status) still have unconfirmed learners, so the
  // banner contradicted the table. Count sessions that actually still have pending
  // learners so we never claim completion while pending rows exist.
  const pendingSessions = rows.filter((r) => r.pending_count > 0).length;

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5" style={{ color: BRAND_GREEN }} />
          <CardTitle>Feedback Completion</CardTitle>
        </div>
        <CardDescription>
          How many of the learners you marked Present have confirmed each session by giving
          feedback. Open a session to see who is still pending.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hardActive ? (
          <Alert className="mb-4 border-red-200 bg-red-50">
            <Lock className="h-4 w-4 text-red-700" />
            <AlertDescription className="text-red-900">
              <strong>Feedback is required.</strong> Sessions stay{' '}
              <strong>Incomplete</strong> until every Present learner confirms with a
              10-second feedback.{' '}
              {incompleteCount > 0
                ? `${incompleteCount} of your sessions ${
                    incompleteCount === 1 ? 'is' : 'are'
                  } currently Incomplete — remind the pending learners.`
                : pendingSessions > 0
                  ? `${pendingSessions} of your sessions still ${
                      pendingSessions === 1 ? 'has' : 'have'
                    } learners who haven't confirmed — remind them so those sessions can complete.`
                  : 'All your sessions are complete.'}
            </AlertDescription>
          </Alert>
        ) : null}

        <Alert className="mb-4 border-green-200 bg-green-50">
          <ShieldCheck className="h-4 w-4" style={{ color: BRAND_GREEN }} />
          <AlertDescription className="text-green-900">
            You see <strong>who</strong>{' '}hasn&apos;t submitted so you can remind them — never
            their ratings or comments.
          </AlertDescription>
        </Alert>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <BeatLoader color={BRAND_GREEN} size={10} />
            <p className="text-sm text-muted-foreground">Loading your sessions…</p>
          </div>
        ) : isError ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {error instanceof Error ? error.message : 'Could not load completion. Please try again.'}
            </AlertDescription>
          </Alert>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <ClipboardCheck className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">No sessions to show yet.</p>
            <p className="text-xs text-muted-foreground">
              Sessions appear here once you mark attendance for a class.
            </p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Confirmed</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={`${r.attendance_date}-${r.period_id}-${i}`}>
                    <TableCell className="whitespace-nowrap font-medium">
                      {formatDate(r.attendance_date)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{r.course_code ?? 'Unspecified'}</span>
                        {r.course_name ? (
                          <span className="text-xs text-muted-foreground">{r.course_name}</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <CompletionCell row={r} />
                    </TableCell>
                    <TableCell>
                      {/* PR-C derived status (hard-gate aware). Falls back to the
                          window Open/Closed read when the RPC pre-dates the migration. */}
                      {r.session_status ? (
                        <SessionStatusBadge status={r.session_status} />
                      ) : r.within_window ? (
                        <Badge variant="outline" className="border-border text-muted-foreground">
                          <Clock className="mr-1 h-3 w-3" />
                          Open
                        </Badge>
                      ) : (
                        <Badge variant="outline" className={BAND_BADGE.none}>
                          Closed
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <PendingRosterDialog row={r} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function FacultySessionInsightPage() {
  // Default range: last 30 days (inclusive of today).
  const { from, to } = useMemo(() => {
    const today = new Date();
    return {
      from: format(subDays(today, 30), 'yyyy-MM-dd'),
      to: format(today, 'yyyy-MM-dd'),
    };
  }, []);

  const { data, isLoading, isError, error } = useFacultyFeedbackSummary(from, to);
  const rows: FacultySummaryRow[] = data ?? [];

  return (
    <ContentLayout>
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/academic">Academic</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Session Feedback (Faculty)</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Live — open an in-class pulse for today's classes (fuels the loop) */}
      <LivePulseSection from={from} to={to} />

      {/* Pre-session materials — post a link ahead + objective opens trace (Rank 3a) */}
      <PreSessionMaterialsControl from={from} to={to} />

      {/* Summary — honest per-course understanding bands (D2/D4, 2026-07-24) */}
      <PerCourseUnderstandingCard rows={rows} />

      {/* Action — your low-understanding topics + the lift + an AI suggested fix */}
      {/* Suspense required for useSearchParams() inside TopicsToRevisitSection (P2 deep-link). */}
      <Suspense fallback={null}>
        <TopicsToRevisitSection from={from} to={to} />
      </Suspense>

      {/* Inbox — every AI note addressed to this facilitator, permanently findable
          (Topics-to-revisit rows vanish on recovery; the attendance ask is transient) */}
      <MyLoopNotesCard />

      {/* Evidence — the caller's OWN 8 work-signals in one place (the board's
          self-scoped mirror; no scores, no comparisons — anti-gaming doctrine) */}
      <MyPulseCard />

      {/* Written follow-ups — anonymous counts of learners' free-text concerns
          being re-asked in this facilitator's courses (>=3-learner floor;
          renders nothing below it). Spec: scf-freetext-carryforward-2026-07-19 */}
      <FreetextCarryCountsCard />

      {/* Re-explanation asks — per-session COUNTS of learners who asked for a
          topic again (Lane C, 20260725133000). Count-only server-side; the
          outcome is the learner's own self-report, so "still open" means they
          have not answered yet — never that anyone refused. Renders nothing
          when there are no asks. */}
      <ClarificationAsksCard />

      {/* Coverage — who confirmed, who's pending */}
      <CompletionSection from={from} to={to} />

      {/* Quality — anonymized understanding signal */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" style={{ color: BRAND_GREEN }} />
            <CardTitle>My Session Feedback</CardTitle>
          </div>
          <CardDescription>
            Understanding signal across your own sessions (last 30 days:{' '}
            {format(new Date(from), 'd MMM')} – {format(new Date(to), 'd MMM yyyy')}).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="mb-4 border-green-200 bg-green-50">
            <ShieldCheck className="h-4 w-4" style={{ color: BRAND_GREEN }} />
            <AlertDescription className="text-green-900">
              Aggregated and anonymous — individual learner responses are never shown.
            </AlertDescription>
          </Alert>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <BeatLoader color={BRAND_GREEN} size={10} />
              <p className="text-sm text-muted-foreground">Loading your session feedback…</p>
            </div>
          ) : isError ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {error instanceof Error
                  ? error.message
                  : 'Could not load your session feedback. Please try again.'}
              </AlertDescription>
            </Alert>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <MessageSquare className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium">No feedback on your sessions yet.</p>
              <p className="text-xs text-muted-foreground">
                Feedback appears here once learners submit it for the sessions you taught.
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead className="text-right">Responses</TableHead>
                    <TableHead>Avg. understood</TableHead>
                    <TableHead className="text-right">Low understanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={`${r.attendance_date}-${r.period_id}-${i}`}>
                      <TableCell className="whitespace-nowrap font-medium">
                        {formatDate(r.attendance_date)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{r.course_code ?? 'Unspecified'}</span>
                          {r.course_name ? (
                            <span className="text-xs text-muted-foreground">{r.course_name}</span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.responses}</TableCell>
                      <TableCell>
                        {/* D3: don't paint a band from a 1-2 response session — a lone
                            "5" is not "Strong". Suppress below the k>=3 floor. */}
                        {r.responses >= SCF_MIN_RESPONSES ? (
                          <UnderstandingCell avg={r.avg_understood} />
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Too few responses
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.low_understanding > 0 ? (
                          <Badge variant="outline" className={BAND_BADGE.bad}>
                            {r.low_understanding}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </ContentLayout>
  );
}
