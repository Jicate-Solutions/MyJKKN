'use client';

// My Confirmed Attendance — learner-facing transparency + early warning (Director
// decision #7, 2026-07-05). Shows the learner their OWN confirmed-attendance %
// (present AND post-class feedback given), forward-only from the enforcement start,
// against the 75% line. Advisory only — never blocks anything, never mutates attendance.
// Shared by /learners/class-feedback and /learners/my-attendance.
// Spec: specs/faculty-feedback-exam-link-2026-07-05.md

import { AlertTriangle, ShieldCheck, TrendingDown, TrendingUp, Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import {
  useMyConfirmedAttendance,
  useFeedbackWindowHours,
  usePendingSessions,
} from '@/hooks/use-session-feedback';

const BRAND = '#0b6d41';
// Two-sided 48h window — the hours come from the shared session_feedback.window_hours
// config lever (copy hint only; the server fns enforce). Fallback until the read resolves.
const DEFAULT_WINDOW_HOURS = 48;
// Same lookback both host pages already pass, so this shares their React Query
// cache entry (scfQueryKeys.pending(30)) instead of firing a second request.
const PENDING_LOOKBACK_DAYS = 30;

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function MyConfirmedAttendanceCard() {
  const { data, isLoading, isError } = useMyConfirmedAttendance();
  const { data: configWindowHours } = useFeedbackWindowHours();
  // What the learner can ACTUALLY act on right now. fn_scf_pending_for_learner is
  // window-filtered — it lists only sessions still inside the window — matching
  // fn_scf_submit_feedback, which hard-rejects anything later. Read before the
  // early returns below so the hook order stays unconditional.
  const {
    data: pendingSessions,
    isLoading: pendingLoading,
    isError: pendingError,
  } = usePendingSessions(PENDING_LOOKBACK_DAYS);
  const CONFIRM_WINDOW_HOURS = configWindowHours ?? DEFAULT_WINDOW_HOURS;

  // Loading and error states must be visible — silently returning null here made
  // the whole attendance section disappear with zero explanation whenever a learner
  // opened the page before the RPC resolved, or it errored transiently
  // (BUG-004845/004846/004849/004855 — the card "self-heals" on reload, which is
  // exactly the symptom of a swallowed loading/error state, not a data problem).
  if (isLoading) {
    return (
      <Card className="border-border">
        <CardContent className="flex items-center gap-3 py-4">
          <div className="h-5 w-5 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="flex items-start gap-3 py-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-medium">Couldn&apos;t load your attendance right now.</p>
            <p className="text-muted-foreground">Please refresh the page in a moment.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Fail-safe: hidden when the caller is not a learner (null) or has no in-scope
  // marks, or when enforcement is off entirely — these are intentional, not errors.
  if (!data) return null;
  if (data.gate_mode === 'off') return null;

  const {
    confirmed_pct, official_pct, total_marks, confirmed_present,
    enforcement_start, pass_line, min_marks,
  } = data;

  // Clean slate — no counted classes yet (forward-only). Encourage the habit.
  if (total_marks === 0) {
    return (
      <Card className="border-[#0b6d41]/25 bg-[#0b6d41]/5">
        <CardContent className="flex items-start gap-3 py-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" style={{ color: BRAND }} />
          <div className="text-sm">
            <p className="font-medium">Tracking feedback for your sessions starts fresh from {fmtDate(enforcement_start)}. Your attendance itself is unaffected.</p>
            <p className="text-muted-foreground">
              From now on, a class counts as <strong>feedback given</strong> once you give the
              quick 10-second feedback <strong>within {CONFIRM_WINDOW_HOURS} hours</strong> of it.
              Keep it up to stay comfortably above the {pass_line}% line.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Settle-in floor — too few classes to judge yet (#6). Show progress, don't alarm.
  if (total_marks < min_marks) {
    return (
      <Card className="border-border">
        <CardContent className="flex items-start gap-3 py-4">
          <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="text-sm">
            <p className="font-medium">Building your feedback record…</p>
            <p className="text-muted-foreground">
              {confirmed_present} of your {total_marks} attended classes so far are confirmed with feedback.
              Your confirmed-with-feedback % starts counting toward the {pass_line}% line after {min_marks} classes —
              keep giving feedback within {CONFIRM_WINDOW_HOURS} hours of each class.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Judged state — three bands around the pass line.
  const atRisk = confirmed_pct < pass_line;
  const close = !atRisk && confirmed_pct < pass_line + 5;

  // Never true-red/AlertTriangle here — this is advisory-only and never blocks or
  // mutates attendance (see file header), but red+triangle reads as a hard error to
  // learners regardless of copy. Prior copy-only fixes (BUG-004638 etc.) didn't stop
  // the misreading, so atRisk uses orange+TrendingDown (still the most urgent band,
  // still visually distinct from "close") instead of red+AlertTriangle.
  const accent = atRisk ? '#c2410c' : close ? '#d97706' : BRAND;
  const bg = atRisk ? 'bg-orange-50 border-orange-200' : close ? 'bg-amber-50 border-amber-200' : 'border-[#0b6d41]/25 bg-[#0b6d41]/5';
  const Icon = atRisk ? TrendingDown : close ? Info : ShieldCheck;
  // Headlines always name the number as FEEDBACK confirmation, never bare
  // "attendance" — a learner who attended 100% must not read the smaller
  // feedback-confirmation % as their attendance (root cause of the BUG-004638
  // "portal shows 82.5%" cluster). Attendance (official_pct) is stated first,
  // reassuringly, then the feedback gap is explained.
  const headline = atRisk
    ? `${confirmed_pct}% of your classes are confirmed with feedback — below the ${pass_line}% line.`
    : close
      ? `You've given feedback for ${confirmed_pct}% of your sessions — just above the ${pass_line}% line.`
      : `You've given feedback for ${confirmed_pct}% of your sessions — above the ${pass_line}% line.`;
  // The at-risk band used to end with "Give feedback on each class to raise it back
  // above {pass_line}%" — an instruction the learner cannot carry out. confirmed_pct
  // is computed over EVERY Present+Absent mark since enforcement_start, but a class
  // can only be confirmed within CONFIRM_WINDOW_HOURS of it (fn_scf_submit_feedback
  // rejects later submissions; fn_scf_pending_for_learner stops listing them), so the
  // deficit already in the number is closed for good and the learner's actionable list
  // is usually 0–1 sessions. Learners followed the instruction, found nothing to open,
  // and reported "I can't send my feedback" (BUG-005254 / 005313 / 005314 / 005315 /
  // 005316). Name the real actionable set instead — and when it is empty, say so and
  // why, rather than sending them hunting. pendingCount stays null until the pending
  // read resolves so a loading state is never rendered as "nothing is open".
  const pendingCount =
    !pendingLoading && !pendingError && Array.isArray(pendingSessions)
      ? pendingSessions.length
      : null;
  const actionLine =
    pendingCount === null
      ? `Give feedback within ${CONFIRM_WINDOW_HOURS} hours of each new class — that's the only window in which a class can be confirmed, so this % climbs from here.`
      : pendingCount > 0
        ? `${pendingCount} ${pendingCount === 1 ? 'session is' : 'sessions are'} still open for feedback right now — give ${pendingCount === 1 ? 'it' : 'those'}, then keep going within ${CONFIRM_WINDOW_HOURS} hours of each new class.`
        : `Nothing is open for feedback right now — a class can only be confirmed within ${CONFIRM_WINDOW_HOURS} hours of it, so earlier sessions can't be made up and this isn't something you've missed a chance to fix. Give feedback within ${CONFIRM_WINDOW_HOURS} hours of each new class and this % climbs from here.`;

  const sub = atRisk
    ? `Your attendance is ${official_pct}% and that's fine — you're never counted absent for missing feedback. What's below the line is feedback: only ${confirmed_pct}% of your attended sessions have feedback given within ${CONFIRM_WINDOW_HOURS} hours. ${actionLine}`
    : close
      ? `Your attendance is ${official_pct}%. To keep your confirmed-with-feedback % above the ${pass_line}% line, give feedback within ${CONFIRM_WINDOW_HOURS} hours of every class.`
      : `Your attendance is ${official_pct}% and ${confirmed_pct}% of those classes are confirmed with feedback. Keep it up.`;

  return (
    <Card className={bg}>
      <CardContent className="py-4">
        <div className="flex items-start gap-3">
          <Icon className="mt-0.5 h-5 w-5 shrink-0" style={{ color: accent }} />
          <div className="min-w-0 flex-1">
            {/* Two distinct numbers so the feedback-confirmation % is never misread
                as attendance: your ATTENDANCE (present, unaffected by feedback) sits
                beside the smaller CONFIRMED-WITH-FEEDBACK % that the gate acts on. */}
            <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Your attendance</p>
                <span className="text-2xl font-semibold tabular-nums text-foreground">
                  {official_pct}%
                </span>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Feedback given</p>
                <span className="text-2xl font-semibold tabular-nums" style={{ color: accent }}>
                  {confirmed_pct}%
                </span>
              </div>
            </div>
            {/* Track: how much of your attendance is confirmed with feedback. */}
            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-muted" title={`Attendance ${official_pct}% · Feedback given ${confirmed_pct}%`}>
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, confirmed_pct)}%`, backgroundColor: accent }} />
            </div>
            <p className="mt-2 text-sm font-medium" style={{ color: accent }}>{headline}</p>
            <p className="text-xs text-muted-foreground">{sub}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
