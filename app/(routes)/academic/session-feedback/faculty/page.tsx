'use client';

// Faculty session feedback — two views:
//  1) COMPLETION (coverage): how many of the Present students confirmed each
//     session (fn_scf_faculty_completion) + a "who hasn't submitted" roster
//     (fn_scf_faculty_pending_roster — identity ONLY, never feedback content).
//  2) UNDERSTANDING (quality): anonymized aggregate signal (fn_scf_faculty_summary).
// Spec: specs/session-feedback-faculty-completion-lane-2026-06-17.md (A — visibility).

import { Suspense, useEffect, useMemo, useState } from 'react';
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
  Trophy,
  Sparkles,
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

const BRAND_GREEN = '#0b6d41';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : format(d, 'd MMM yyyy');
}

// ── Understanding (quality) — unchanged from the original L3 view ────────────
function understandingBand(avg: number | null): 'good' | 'warn' | 'bad' | 'none' {
  if (avg === null || Number.isNaN(avg)) return 'none';
  if (avg >= 4) return 'good';
  if (avg >= 3) return 'warn';
  return 'bad';
}

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

function UnderstandingCell({ avg }: { avg: number | null }) {
  const band = understandingBand(avg);
  const pct =
    avg === null || Number.isNaN(avg) ? 0 : Math.max(0, Math.min(100, (avg / 5) * 100));
  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className={BAND_BADGE[band]}>
        {avg === null || Number.isNaN(avg) ? '—' : avg.toFixed(1)}
      </Badge>
      <div
        className="h-2 w-20 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={
          avg === null || Number.isNaN(avg)
            ? 'No understanding signal'
            : `Average understanding ${avg.toFixed(1)} out of 5`
        }
      >
        <div className={`h-full rounded-full ${BAND_BAR[band]}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
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
  useEffect(() => {
    if (!deepCourse || rows.length === 0) return;
    const el = document.querySelector(`[data-course-anchor="${CSS.escape(deepCourse)}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [deepCourse, rows.length]);
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
                      <span className="font-semibold tabular-nums text-red-600">
                        {r.avg_understood != null ? r.avg_understood.toFixed(2) : '—'}
                      </span>
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

// ── Reward — "you're above 3.5, here's what's working" (PR-E) ─────────────────
// Positive-reinforcement counterpart to "Topics to revisit". Driven ENTIRELY by the
// already-loaded fn_scf_faculty_summary rows — no new RPC, no new table. Renders only
// when the caller's weighted understanding average clears the reward threshold, so it
// never withholds help from struggling faculty (that path always ships alongside).
const REWARD_THRESHOLD = 3.5; // spec §5.1 — the chair's 3.5 "insights flow" number
const REWARD_MIN_RESPONSES = 3; // don't celebrate on a single stray response (k>=3)

function FacultyRewardCard({ rows }: { rows: FacultySummaryRow[] }) {
  const stats = useMemo(() => {
    let respWithAvg = 0;
    let weightedSum = 0;
    let answeredSessions = 0; // sessions that actually got at least one response
    let goodSessions = 0;
    let cleanSessions = 0;
    for (const r of rows) {
      // Empty sessions (no responses) must not dilute or inflate the "X of Y" counts —
      // base BOTH the numerator and the denominator on sessions that got feedback. An
      // unanswered session has no understanding signal, so it is neither "clean" nor
      // "good"; it simply doesn't count here.
      if (r.responses > 0) {
        answeredSessions += 1;
        if (r.low_understanding === 0) cleanSessions += 1;
        // goodSessions is the "X" against the answeredSessions "Y". Gate it on the SAME
        // responses>0 base so a zero-response session that happens to carry a non-null
        // avg_understood can never push the numerator above the denominator (X > Y).
        if (
          r.avg_understood != null &&
          !Number.isNaN(r.avg_understood) &&
          r.avg_understood >= 4
        ) {
          goodSessions += 1;
        }
      }
      if (r.avg_understood != null && !Number.isNaN(r.avg_understood)) {
        respWithAvg += r.responses;
        weightedSum += r.avg_understood * r.responses;
      }
    }
    const overallAvg = respWithAvg > 0 ? weightedSum / respWithAvg : null;
    return {
      overallAvg,
      respWithAvg,
      sessions: answeredSessions,
      goodSessions,
      cleanSessions,
    };
  }, [rows]);

  // Not enough signal, or below the reward bar → the "Topics to revisit" path
  // (which always ships) covers this teacher instead. Render nothing here.
  if (
    stats.overallAvg == null ||
    stats.respWithAvg < REWARD_MIN_RESPONSES ||
    stats.overallAvg < REWARD_THRESHOLD
  ) {
    return null;
  }

  return (
    <Card className="mb-6 border-amber-200 bg-gradient-to-br from-amber-50 to-green-50">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" />
          <CardTitle>You&apos;re at or above {REWARD_THRESHOLD.toFixed(1)} — here&apos;s what&apos;s working</CardTitle>
        </div>
        <CardDescription>
          Your learners&apos; average understanding across the last 30 days is{' '}
          <strong className="text-green-800">{stats.overallAvg.toFixed(1)} / 5</strong>. Keep
          doing what you&apos;re doing.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          <li className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <span>
              <strong>{stats.goodSessions}</strong> of your{' '}
              <strong>{stats.sessions}</strong> sessions scored{' '}
              <strong>Good or Clear</strong> (4+/5) on understanding.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
            <span>
              <strong>{stats.cleanSessions}</strong> of your sessions had{' '}
              <strong>zero</strong> learners reporting low understanding.
            </span>
          </li>
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

      {/* Reward — positive reinforcement when understanding clears the bar (PR-E) */}
      <FacultyRewardCard rows={rows} />

      {/* Action — your low-understanding topics + the lift + an AI suggested fix */}
      {/* Suspense required for useSearchParams() inside TopicsToRevisitSection (P2 deep-link). */}
      <Suspense fallback={null}>
        <TopicsToRevisitSection from={from} to={to} />
      </Suspense>

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
                        <UnderstandingCell avg={r.avg_understood} />
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
