'use client';

// Induction scorecard — the headline value→advocacy→referred→submitted→JOINED
// funnel for one induction, broken out by department and batch. "Joined" is read
// LIVE off the admission funnel (the program KPI). A coordinator can record the
// induction as NAAC Criterion 5 + 7 evidence (canonical quality_evidence_mappings).
import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  InductionService, type ScorecardRow,
} from '@/lib/services/induction/induction-service';
import {
  Users, Star, Megaphone, UserPlus, Send, GraduationCap, ShieldCheck, RefreshCw,
} from 'lucide-react';

function fmt(n: number | null, suffix = ''): string {
  return n === null || n === undefined ? '—' : `${n}${suffix}`;
}

// Scores are Postgres NUMERIC; PostgREST strips trailing zeros on the way out
// (3.90 → 3.9, 1.00 → 1), so a column of averages renders ragged. Pin to 2dp.
// Number() because the same column can arrive as a string on other clients.
function fmtScore(n: number | null): string {
  return n === null || n === undefined ? '—' : Number(n).toFixed(2);
}

// An average PLUS the denominator it was computed from. A bare — is
// indistinguishable from a broken query, and an average over 3 of 11 freshers must
// not read with the same authority as one over 141 of 195. fn_induction_scorecard
// already returns value_rated / advocacy_given per row — this stops throwing them away.
function ScoreCell({ avg, n, of }: { avg: number | null; n: number; of: number }) {
  return (
    <div className="leading-tight">
      <div>{fmtScore(avg)}</div>
      <div className="text-[11px] text-muted-foreground tabular-nums">{n}/{of}</div>
    </div>
  );
}

export function ScorecardSection({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<ScorecardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [emitting, setEmitting] = useState(false);
  // Out-of-scope viewers (e.g. a resource person with no access to this event's
  // institution, no induction.view, not a coordinator) get a not-authorized RAISE
  // from fn_induction_scorecard. Graceful-deny: render a muted note, no red toast.
  const [denied, setDenied] = useState(false);
  // Server-truth event manage gate (same fn_induction_can_manage_event RPC as the
  // sessions section): a scope='own' resource person with no access to this event's
  // institution is NOT a manager, so the "Record as NAAC evidence" button stays
  // hidden instead of dangling and erroring on click (the write RPC denies them too).
  const [canManage, setCanManage] = useState(false);
  useEffect(() => {
    InductionService.canManageEvent(eventId).then(setCanManage).catch(() => setCanManage(false));
  }, [eventId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await InductionService.getScorecard(eventId));
      setDenied(false);
    } catch (e: any) {
      // Every RAISE in fn_induction_scorecard (not authenticated / not an induction
      // event / not authorized) is SQLSTATE P0001 — treat as a role-scope denial and
      // render nothing loud. Any OTHER error is a real failure → surface the toast.
      if (e?.code === 'P0001') {
        setDenied(true);
      } else {
        toast.error(`Couldn't load the scorecard: ${e.message ?? e}`);
      }
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  const handleEmit = async () => {
    setEmitting(true);
    try {
      const n = await InductionService.emitNaacEvidence(eventId);
      if (n === 0) {
        toast.info('NAAC evidence for this induction is already curated manually — left untouched.');
      } else {
        toast.success(
          `Recorded as NAAC evidence (${n} criterion row${n === 1 ? '' : 's'}${n < 2 ? '; a manually-curated row was preserved' : ': 6.3.1 + 6.3.2'}).`,
        );
      }
    } catch (e: any) {
      toast.error(`Couldn't record evidence: ${e.message ?? e}`);
    } finally {
      setEmitting(false);
    }
  };

  // Graceful-deny: a role that isn't allowed to see the scorecard gets a quiet
  // muted note instead of a red error toast. Authorized render path is untouched.
  if (denied) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">
            The scorecard isn’t available for your role.
          </p>
        </CardContent>
      </Card>
    );
  }

  const total = rows.find((r) => r.dimension === 'total');
  const depts = rows.filter((r) => r.dimension === 'department');
  const batches = rows.filter((r) => r.dimension === 'batch');
  // group_id NULL is the “— No batch —” bucket, not a real batch.
  const realBatches = batches.filter((r) => r.group_id !== null);

  // The funnel, left→right: experienced value drives advocacy drives referral drives JOIN.
  const steps = total ? [
    { icon: Users, label: 'Enrolled', value: fmt(total.enrolled), hint: 'freshers in this induction' },
    { icon: Star, label: 'Value', value: fmtScore(total.value_avg), hint: `avg 1–5 · ${total.value_rated} of ${total.enrolled} rated` },
    // NOT NPS: this is the mean 0–10 recommendation score. Real NPS is
    // %promoters − %detractors on a −100…+100 scale — don't relabel it back.
    { icon: Megaphone, label: 'Advocacy', value: fmtScore(total.advocacy_avg), hint: `avg 0–10 · ${total.advocacy_given} of ${total.enrolled} rated · ${total.promoters} promoter${total.promoters === 1 ? '' : 's'}` },
    { icon: UserPlus, label: 'Referred', value: fmt(total.referred), hint: 'freshers who referred' },
    { icon: Send, label: 'Submitted', value: fmt(total.referrals_submitted), hint: 'prospects referred' },
    { icon: GraduationCap, label: 'Joined', value: fmt(total.referrals_joined), hint: 'referrals that joined', kpi: true },
  ] : [];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base">Scorecard</CardTitle>
          <CardDescription>
            The value → advocacy → referral → <span className="font-medium text-foreground">join</span>{' '}
            funnel. A join into a seat is the programme&apos;s success metric.
          </CardDescription>
        </div>
        {canManage && (
          <Button size="sm" variant="outline" onClick={handleEmit} disabled={emitting || !total || total.enrolled === 0}>
            <ShieldCheck className="h-4 w-4 mr-1" />
            {emitting ? 'Recording…' : 'Record as NAAC evidence'}
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-6">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : !total || total.enrolled === 0 ? (
          <p className="text-sm text-muted-foreground">
            No freshers enrolled yet — the scorecard fills in as freshers are enrolled, attend
            sessions, advocate and refer. <button onClick={load} className="underline">Refresh</button>.
          </p>
        ) : (
          <>
            {/* Funnel headline */}
            <div className="flex flex-wrap items-stretch gap-2">
              {steps.map((s, i) => (
                <div key={s.label}
                  className={`flex-1 min-w-[120px] rounded-lg border p-3 ${s.kpi ? 'border-emerald-500/60 bg-emerald-50/60 dark:bg-emerald-950/20' : ''}`}>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <s.icon className={`h-3.5 w-3.5 ${s.kpi ? 'text-emerald-600' : ''}`} />
                    {s.label}
                  </div>
                  <div className={`text-2xl font-bold mt-1 ${s.kpi ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>
                    {s.value}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{s.hint}</div>
                </div>
              ))}
            </div>

            {/* By department */}
            {depts.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-2">By department</div>
                <ScorecardTable rows={depts} firstCol="Department" />
              </div>
            )}

            {/* By batch — the unassigned bucket ALONE is not a breakdown, it just
                restates the Enrolled card. Render the table only once real batches
                exist; otherwise point at the “Split into batches” control above. */}
            <div>
              <div className="text-sm font-medium mb-2">By batch</div>
              {realBatches.length > 0 ? (
                <ScorecardTable rows={batches} firstCol="Batch" />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Not split into batches yet — every fresher is unassigned, so a batch
                  breakdown would only repeat the totals above.
                  {canManage && ' Use “Split into batches” at the top of this page to divide the cohort.'}
                </p>
              )}
            </div>

            <div className="flex justify-end">
              <Button size="sm" variant="ghost" onClick={load}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ScorecardTable({ rows, firstCol }: { rows: ScorecardRow[]; firstCol: string }) {
  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{firstCol}</TableHead>
            <TableHead className="text-right">Enrolled</TableHead>
            <TableHead className="text-right">Value (1–5)</TableHead>
            <TableHead className="text-right">Advocacy (0–10)</TableHead>
            <TableHead className="text-right">Referred</TableHead>
            <TableHead className="text-right">Submitted</TableHead>
            <TableHead className="text-right">Joined</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={`${r.dimension}-${r.group_id ?? r.group_label}`}>
              <TableCell className="font-medium">{r.group_label}</TableCell>
              <TableCell className="text-right">{r.enrolled}</TableCell>
              <TableCell className="text-right">
                <ScoreCell avg={r.value_avg} n={r.value_rated} of={r.enrolled} />
              </TableCell>
              <TableCell className="text-right">
                <ScoreCell avg={r.advocacy_avg} n={r.advocacy_given} of={r.enrolled} />
              </TableCell>
              <TableCell className="text-right">{r.referred}</TableCell>
              <TableCell className="text-right">{r.referrals_submitted}</TableCell>
              <TableCell className="text-right font-semibold text-emerald-700 dark:text-emerald-400">
                {r.referrals_joined}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
