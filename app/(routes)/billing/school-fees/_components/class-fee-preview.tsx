'use client';

// class-fee-preview.tsx
//
// "What will each learner in this class actually be billed?" — read-only.
//
// Every number here comes from school_fee_resolve_for_learner(), the same RPC
// Phase 7 will use to raise bills. There is no TypeScript copy of the
// concession maths, so what a clerk sees here and what gets billed cannot
// disagree.

import { useState } from 'react';
import { Eye, Users, AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { useSchoolFeeClassPreview } from '@/hooks/school-fees/use-school-fee-resolution';

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

const REASON_LABEL: Record<string, string> = {
  no_active_plan: 'No active plan',
  learner_missing_class_or_year: 'Learner has no class or year set',
  plan_has_no_items: 'Plan has no fee heads',
};

interface ClassFeePreviewProps {
  institutionId: string;
  programId: string;
  academicYearId: string;
  className: string;
}

export function ClassFeePreview({
  institutionId,
  programId,
  academicYearId,
  className,
}: ClassFeePreviewProps) {
  // Opt-in: the RPC resolves every enrolled learner in the class, so it should
  // not fire just because someone opened the plan to fix a typo.
  const [open, setOpen] = useState(false);

  const { rows, summary, loading, error } = useSchoolFeeClassPreview(
    open ? institutionId : undefined,
    open ? programId : undefined,
    open ? academicYearId : undefined,
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Learner preview
            {open && !loading ? (
              <Badge variant="secondary">
                {summary.matched}/{summary.learners} resolved
              </Badge>
            ) : null}
          </CardTitle>

          {!open ? (
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              <Eye className="h-4 w-4 mr-1" />
              Preview {className}
            </Button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {!open ? (
          <p className="text-sm text-muted-foreground">
            Resolve this plan against every enrolled learner in {className} to see the exact amounts
            — after concessions — before any bill is raised. Nothing is written.
          </p>
        ) : loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertTitle>Could not resolve fees</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : rows.length === 0 ? (
          <Alert>
            <AlertTitle>No enrolled learners</AlertTitle>
            <AlertDescription>
              No learner in {className} is marked active for this academic year, so there is nothing
              to bill yet.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label="Learners" value={String(summary.learners)} />
              <Stat label="Gross" value={`₹${inr.format(summary.gross)}`} />
              <Stat
                label="Concession"
                value={`−₹${inr.format(summary.concession)}`}
                hint={`${summary.withConcession} learner(s)`}
              />
              <Stat label="Net billable" value={`₹${inr.format(summary.net)}`} emphasis />
            </div>

            {summary.unmatched > 0 ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>
                  {summary.unmatched} learner{summary.unmatched === 1 ? '' : 's'} could not be
                  resolved
                </AlertTitle>
                <AlertDescription>
                  These are skipped by generation rather than billed at zero. The reason is shown in
                  their row.
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[140px]">Roll no.</TableHead>
                    <TableHead className="min-w-[180px]">Learner</TableHead>
                    <TableHead className="text-right min-w-[110px]">Gross</TableHead>
                    <TableHead className="text-right min-w-[130px]">Concession</TableHead>
                    <TableHead className="text-right min-w-[110px]">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.learner_id}>
                      <TableCell className="tabular-nums">{r.roll_number ?? '—'}</TableCell>
                      <TableCell className="font-medium">{r.learner_name || '—'}</TableCell>

                      {r.matched ? (
                        <>
                          <TableCell className="text-right tabular-nums">
                            ₹{inr.format(r.year_gross)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.year_concession > 0 ? (
                              <span className="flex items-center justify-end gap-1.5">
                                <Badge variant="secondary">{r.concession_count}</Badge>−₹
                                {inr.format(r.year_concession)}
                              </span>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            ₹{inr.format(r.year_net)}
                          </TableCell>
                        </>
                      ) : (
                        <TableCell colSpan={3} className="text-right">
                          <Badge variant="outline">
                            {REASON_LABEL[r.reason ?? ''] ?? r.reason ?? 'Not resolved'}
                          </Badge>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`tabular-nums ${emphasis ? 'text-lg font-bold' : 'text-base font-semibold'}`}>
        {value}
      </div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
