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
            <p className="font-medium">Your confirmed attendance starts fresh from {fmtDate(enforcement_start)}.</p>
            <p className="text-muted-foreground">
              From now on, a class counts as <strong>confirmed</strong> once you give the
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
            <p className="font-medium">Building your confirmed attendance…</p>
            <p className="text-muted-foreground">
              {confirmed_present} of your {total_marks} classes so far are confirmed with feedback.
              Your confirmed % starts counting toward the {pass_line}% line after {min_marks} classes —
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
  const headline = atRisk
    ? `Your confirmed attendance is ${confirmed_pct}% — below the ${pass_line}% line.`
    : close
      ? `Your confirmed attendance is ${confirmed_pct}% — just above the ${pass_line}% line.`
      : `You're at ${confirmed_pct}% confirmed attendance — above the ${pass_line}% line.`;
  const sub = atRisk
    ? `You attended ${official_pct}% of classes, but only ${confirmed_pct}% are confirmed with feedback. Give feedback within ${CONFIRM_WINDOW_HOURS} hours of each class to raise it back above ${pass_line}%.`
    : close
      ? `You attended ${official_pct}% of classes. Give feedback within ${CONFIRM_WINDOW_HOURS} hours of every class so you don't slip below ${pass_line}%.`
      : `You attended ${official_pct}% and confirmed ${confirmed_pct}% with feedback. Keep it up.`;

  return (
    <Card className={bg}>
      <CardContent className="py-4">
        <div className="flex items-start gap-3">
          <Icon className="mt-0.5 h-5 w-5 shrink-0" style={{ color: accent }} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="text-sm font-medium">Confirmed attendance</p>
              <span className="text-2xl font-semibold tabular-nums" style={{ color: accent }}>
                {confirmed_pct}%
              </span>
            </div>
            {/* Track: official (attended) vs confirmed (attended AND feedback). */}
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted" title={`Attended ${official_pct}% · Confirmed ${confirmed_pct}%`}>
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
