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

export function ScorecardSection({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<ScorecardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [emitting, setEmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await InductionService.getScorecard(eventId));
    } catch (e: any) {
      toast.error(`Couldn't load the scorecard: ${e.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  const handleEmit = async () => {
    setEmitting(true);
    try {
      const n = await InductionService.emitNaacEvidence(eventId);
      toast.success(`Recorded as NAAC evidence (${n} criterion row${n === 1 ? '' : 's'}: 5.1.3 + 7.2.1).`);
    } catch (e: any) {
      toast.error(`Couldn't record evidence: ${e.message ?? e}`);
    } finally {
      setEmitting(false);
    }
  };

  const total = rows.find((r) => r.dimension === 'total');
  const depts = rows.filter((r) => r.dimension === 'department');
  const batches = rows.filter((r) => r.dimension === 'batch');

  // The funnel, left→right: experienced value drives advocacy drives referral drives JOIN.
  const steps = total ? [
    { icon: Users, label: 'Enrolled', value: fmt(total.enrolled), hint: 'freshers in this induction' },
    { icon: Star, label: 'Value', value: fmt(total.value_avg), hint: `avg rating · ${total.value_rated} rated` },
    { icon: Megaphone, label: 'Advocacy', value: fmt(total.advocacy_avg), hint: `avg NPS · ${total.promoters} promoter${total.promoters === 1 ? '' : 's'}` },
    { icon: UserPlus, label: 'Referred', value: fmt(total.referred), hint: 'freshers who referred' },
    { icon: Send, label: 'Submitted', value: fmt(total.referrals_submitted), hint: 'prospects referred' },
    { icon: GraduationCap, label: 'Joined', value: fmt(total.referrals_joined), hint: 'referrals that joined', kpi: true },
  ] : [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">Scorecard</CardTitle>
          <CardDescription>
            The value → advocacy → referral → <span className="font-medium text-foreground">join</span>{' '}
            funnel. A join into a seat is the programme&apos;s success metric.
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={handleEmit} disabled={emitting || !total || total.enrolled === 0}>
          <ShieldCheck className="h-4 w-4 mr-1" />
          {emitting ? 'Recording…' : 'Record as NAAC evidence'}
        </Button>
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

            {/* By batch */}
            {batches.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-2">By batch</div>
                <ScorecardTable rows={batches} firstCol="Batch" />
              </div>
            )}

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
            <TableHead className="text-right">Value</TableHead>
            <TableHead className="text-right">NPS</TableHead>
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
              <TableCell className="text-right">{fmt(r.value_avg)}</TableCell>
              <TableCell className="text-right">{fmt(r.advocacy_avg)}</TableCell>
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
