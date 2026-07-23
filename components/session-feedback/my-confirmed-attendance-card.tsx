'use client';

// My Confirmed Attendance — learner-facing transparency + early warning (Director
// decision #7, 2026-07-05). Shows the learner their OWN confirmed-attendance %
// (present AND post-class feedback given), forward-only from the enforcement start,
// against the 75% line. Advisory only — never blocks anything, never mutates attendance.
// Shared by /learners/class-feedback and /learners/my-attendance.
// Spec: specs/faculty-feedback-exam-link-2026-07-05.md

import { ShieldCheck, AlertTriangle, TrendingUp, Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useMyConfirmedAttendance, useFeedbackWindowHours } from '@/hooks/use-session-feedback';

const BRAND = '#0b6d41';
// Two-sided 48h window — the hours come from the shared session_feedback.window_hours
// config lever (copy hint only; the server fns enforce). Fallback until the read resolves.
const DEFAULT_WINDOW_HOURS = 48;

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function MyConfirmedAttendanceCard() {
  const { data, isLoading, isError } = useMyConfirmedAttendance();
  const { data: configWindowHours } = useFeedbackWindowHours();
  const CONFIRM_WINDOW_HOURS = configWindowHours ?? DEFAULT_WINDOW_HOURS;

  // Fail-safe: never render a broken/misleading card. Hidden while loading, on error,
  // when the caller is not a learner (null), or when enforcement is off entirely.
  if (isLoading || isError || !data) return null;
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
              {confirmed_present} of your {total_marks} attended classes so far have feedback given.
              Your feedback-given % starts counting toward the {pass_line}% line after {min_marks} classes —
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

  const accent = atRisk ? '#dc2626' : close ? '#d97706' : BRAND;
  const bg = atRisk ? 'bg-red-50 border-red-200' : close ? 'bg-amber-50 border-amber-200' : 'border-[#0b6d41]/25 bg-[#0b6d41]/5';
  const Icon = atRisk ? AlertTriangle : close ? Info : ShieldCheck;
  // Headlines always name the number as FEEDBACK given, never bare
  // "attendance" — a learner who attended 100% must not read the smaller
  // feedback % as their attendance (root cause of the BUG-004638 "portal
  // shows 82.5%" cluster, recurring as BUG-005149/5151/5153 — the word
  // "confirmed" paired with "attendance" was still being misread as
  // "attendance confirmation is broken", so the metric label was changed
  // from "Confirmed with feedback" to "Feedback given"). Attendance
  // (official_pct) is stated first, reassuringly, then the feedback gap
  // is explained.
  const headline = atRisk
    ? `You've given feedback for ${confirmed_pct}% of your sessions — below the ${pass_line}% line. Your attendance is not affected.`
    : close
      ? `You've given feedback for ${confirmed_pct}% of your sessions — just above the ${pass_line}% line.`
      : `You've given feedback for ${confirmed_pct}% of your sessions — above the ${pass_line}% line.`;
  const sub = atRisk
    ? `Your attendance is ${official_pct}% and that's fine — you're never counted absent for missing feedback. What's below the line is feedback: only ${confirmed_pct}% of your attended classes have feedback given within ${CONFIRM_WINDOW_HOURS} hours. Give feedback on each class to raise it back above ${pass_line}%.`
    : close
      ? `Your attendance is ${official_pct}%. To keep your feedback-given % above the ${pass_line}% line, give feedback within ${CONFIRM_WINDOW_HOURS} hours of every class.`
      : `Your attendance is ${official_pct}% and ${confirmed_pct}% of those classes have feedback given. Keep it up.`;

  return (
    <Card className={bg}>
      <CardContent className="py-4">
        <div className="flex items-start gap-3">
          <Icon className="mt-0.5 h-5 w-5 shrink-0" style={{ color: accent }} />
          <div className="min-w-0 flex-1">
            {/* Two distinct numbers so the feedback % is never misread as attendance:
                your ATTENDANCE (present, unaffected by feedback) sits beside the
                smaller FEEDBACK GIVEN % that the gate acts on. */}
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
            {/* Track: how much of your attendance has feedback given. */}
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
