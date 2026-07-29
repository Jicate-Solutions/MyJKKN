'use client';

// Confirmed-Attendance Advisory Panel (Build 2b, Director decision #8, 2026-07-05).
// Surfaces the feedback-CONFIRMED attendance % for the report's scope, ADVISORY only:
// it is deliberately NOT part of the official-% path above it and NEVER blocks anyone.
// A human reads it and decides detention/condonation. Forward-only + settle-in (>=10
// marks) are honored by fn_scf_effective_attendance + the banding below.
// Spec: specs/faculty-feedback-exam-link-2026-07-05.md

import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, AlertTriangle, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AttendanceConsolidationService } from '@/lib/services/academic/attendance-consolidation-service';
import type { EffectiveAttendanceRow } from '@/types/session-feedback';
import { useEligibilityThresholds } from '@/hooks/academic/use-eligibility-thresholds';

const BRAND = '#0b6d41';

export function ConfirmedAttendanceAdvisoryPanel({
  institutionId,
  dateFrom,
  dateTo,
  passLine: passLineProp,
  minMarks = 10,
}: {
  institutionId: string | null;
  dateFrom: string;
  dateTo: string;
  /** Explicit override. When omitted, the configured eligibility threshold is used. */
  passLine?: number;
  minMarks?: number;
}) {
  // The pass line is configuration, not a literal (2026-07-26). Scoped to the
  // report's institution; falls back to 75 while loading or if the RPC fails.
  const { thresholds } = useEligibilityThresholds(institutionId);
  const passLine = passLineProp ?? thresholds.eligibility;

  const { data, isLoading } = useQuery({
    queryKey: ['confirmed-attendance-advisory', institutionId, dateFrom, dateTo],
    queryFn: () =>
      AttendanceConsolidationService.getEffectiveAttendanceCoupling(dateFrom, dateTo, {
        institutionId: institutionId ?? null,
      }),
    staleTime: 60 * 1000,
    enabled: !!dateFrom && !!dateTo,
  });

  if (isLoading || !data) return null;
  // Coupling off → nothing was computed; stay silent (feature dark).
  if (!data.enabled) return null;

  const rows: EffectiveAttendanceRow[] = data.rows ?? [];

  // Clean-slate: forward-only floor means pre-enforcement periods have no in-scope marks.
  if (rows.length === 0) {
    return (
      <Card className="border-[#0b6d41]/25 bg-[#0b6d41]/5">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" style={{ color: BRAND }} />
            Feedback-confirmed attendance (advisory)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No confirmed-attendance data in this report&apos;s period yet — the rule counts
            classes from the enforcement start date forward. As learners attend and give
            feedback, their confirmed % appears here. This is advisory and never changes the
            official figures below.
          </p>
        </CardContent>
      </Card>
    );
  }

  let ok = 0, atRisk = 0, building = 0;
  const atRiskRows: EffectiveAttendanceRow[] = [];
  for (const r of rows) {
    const total = r.present_marks + r.absent_marks;
    if (total < minMarks) building += 1;
    else if (r.effective_pct < passLine) { atRisk += 1; atRiskRows.push(r); }
    else ok += 1;
  }
  atRiskRows.sort((a, b) => a.effective_pct - b.effective_pct);

  return (
    <Card className="border-amber-200">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" style={{ color: BRAND }} />
          Feedback-confirmed attendance (advisory)
        </CardTitle>
        <CardDescription>
          Attendance that is BOTH marked Present AND confirmed with post-class feedback, against
          the {passLine}% line. Advisory — a person decides any action; the official figures below
          are unchanged. Learners with fewer than {minMarks} classes are still &ldquo;building&rdquo;.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-md border border-green-200 bg-green-50 p-3 text-center">
            <div className="text-2xl font-semibold text-green-700 tabular-nums">{ok}</div>
            <div className="text-xs text-green-800">At or above {passLine}%</div>
          </div>
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-center">
            <div className="text-2xl font-semibold text-red-700 tabular-nums">{atRisk}</div>
            <div className="text-xs text-red-800">Below {passLine}% (at-risk)</div>
          </div>
          <div className="rounded-md border border-border bg-muted/40 p-3 text-center">
            <div className="text-2xl font-semibold text-muted-foreground tabular-nums">{building}</div>
            <div className="text-xs text-muted-foreground">Building (&lt;{minMarks} classes)</div>
          </div>
        </div>

        {atRisk > 0 && (
          <Alert className="border-amber-200 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-700" />
            <AlertDescription className="text-amber-900">
              <strong>{atRisk}</strong> learner{atRisk === 1 ? '' : 's'} below the {passLine}% confirmed line.
              Review each in the official breakdown below before deciding detention or condonation.
            </AlertDescription>
          </Alert>
        )}

        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Per-learner names appear in the official breakdown below (matched by student). This panel
          summarizes the confirmed-attendance picture; it does not alter any official attendance %.
        </p>
      </CardContent>
    </Card>
  );
}
