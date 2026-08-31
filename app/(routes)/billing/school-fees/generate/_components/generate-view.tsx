'use client';

// generate-view.tsx
//
// The screen that turns fee plans into money owed.
//
// Everything here is arranged around one idea: the operator should understand
// exactly what will happen BEFORE anything is written, and should never be
// able to trigger the write by accident. Hence a preview that runs on load, a
// per-class table that explains every skip, and a typed confirmation on the
// commit.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Info, PlayCircle, ShieldAlert, History, CheckCircle2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { usePermissions } from '@/hooks/use-permissions';
import { useSchoolYearSelection } from '@/hooks/school-fees/use-school-year-selection';
import { useSchoolFeeGeneration } from '@/hooks/school-fees/use-school-fee-generation';

import { SchoolYearPicker } from '../../_components/school-year-picker';
import { GENERATION_STATUS_LABEL, type GenerationClassStatus } from '@/types/school-fees';

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

const STATUS_VARIANT: Record<GenerationClassStatus, 'default' | 'secondary' | 'outline'> = {
  ready: 'default',
  already_generated: 'secondary',
  no_plan: 'outline',
  no_calendar: 'outline',
  no_learners: 'outline',
};

const CONFIRM_WORD = 'GENERATE';

export function GenerateView() {
  const { canAccess, isSuperAdmin } = usePermissions();
  const canGenerate = isSuperAdmin || canAccess('school_fees', 'generate');

  const {
    institutions,
    institutionId,
    setInstitutionChoice,
    yearOptions,
    academicYearId,
    setYearChoice,
    loadingInstitutions,
    loadingYears,
    ready,
  } = useSchoolYearSelection();

  const { rows, summary, runs, lastResult, loading, running, error, dryRun, commit } =
    useSchoolFeeGeneration(institutionId || undefined, academicYearId || undefined);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const yearName =
    yearOptions.find((y) => y.id === academicYearId)?.academic_year_name ?? 'this year';

  const blocked = useMemo(
    () => rows.filter((r) => r.status === 'no_calendar'),
    [rows],
  );

  const nothingToDo = summary.ready === 0;

  return (
    <div className="space-y-6">
      <SchoolYearPicker
        title="Generate for"
        institutions={institutions}
        institutionId={institutionId}
        onInstitutionChange={setInstitutionChoice}
        yearOptions={yearOptions}
        academicYearId={academicYearId}
        onYearChange={setYearChoice}
        loadingInstitutions={loadingInstitutions}
        loadingYears={loadingYears}
      />

      {!ready ? (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Choose a school and academic year</AlertTitle>
          <AlertDescription>
            Generation raises one bill row per learner, per term, per fee head — for the whole
            school at once.
          </AlertDescription>
        </Alert>
      ) : loading ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not build the preview</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Classes ready" value={`${summary.ready} / ${summary.classes}`} />
            <Stat label="Learners to bill" value={String(summary.billable)} />
            <Stat
              label="Already billed"
              value={String(summary.alreadyBilled)}
              hint="skipped on re-run"
            />
            <Stat label="Net to raise" value={`₹${inr.format(summary.net)}`} emphasis />
          </div>

          {blocked.length > 0 ? (
            <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>
                {blocked.length} class{blocked.length === 1 ? '' : 'es'} blocked by a missing term
                calendar
              </AlertTitle>
              <AlertDescription>
                A bill with no due date can never be chased or fined, so these classes are refused
                rather than half-billed.{' '}
                <Link
                  href="/billing/school-fees/term-calendar"
                  className="underline underline-offset-2"
                >
                  Complete the term calendar
                </Link>{' '}
                for {yearName}, then re-check.
              </AlertDescription>
            </Alert>
          ) : null}

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">Per class</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => dryRun()} disabled={running}>
                    <PlayCircle className="h-4 w-4 mr-1" />
                    {running ? 'Running…' : 'Dry run'}
                  </Button>
                  <Button
                    size="sm"
                    disabled={!canGenerate || running || nothingToDo}
                    onClick={() => {
                      setConfirmText('');
                      setConfirmOpen(true);
                    }}
                  >
                    Generate {summary.billable > 0 ? `${summary.billable} learner(s)` : ''}
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {nothingToDo ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Nothing ready to generate</AlertTitle>
                  <AlertDescription>
                    Every class is either already generated, has no active plan, has no enrolled
                    learners, or is missing term dates. The table below says which.
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[150px]">Class</TableHead>
                      <TableHead className="min-w-[170px]">Status</TableHead>
                      <TableHead className="text-right w-[100px]">Learners</TableHead>
                      <TableHead className="text-right w-[110px]">To bill</TableHead>
                      <TableHead className="text-right min-w-[130px]">Net</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.program_id}>
                        <TableCell className="font-medium">
                          {r.class_name}
                          {r.version ? (
                            <span className="ml-2 text-xs text-muted-foreground">v{r.version}</span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[r.status]}>
                            {GENERATION_STATUS_LABEL[r.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.learners}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.status === 'ready' ? r.billable : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.status === 'ready' ? `₹${inr.format(r.year_net)}` : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {lastResult && !lastResult.dry_run ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>
                Generated {lastResult.bills_created} bill row
                {lastResult.bills_created === 1 ? '' : 's'}
              </AlertTitle>
              <AlertDescription>
                {lastResult.plans_locked ?? 0} plan(s) are now locked — changing their amounts needs
                a new version. Bills are visible under Billing.
              </AlertDescription>
            </Alert>
          ) : null}

          {runs.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <History className="h-4 w-4" />
                  Recent runs
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[180px]">When</TableHead>
                        <TableHead className="w-[110px]">Mode</TableHead>
                        <TableHead className="text-right w-[110px]">Learners</TableHead>
                        <TableHead className="text-right w-[110px]">Bills</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {runs.map((run) => (
                        <TableRow key={run.id}>
                          <TableCell className="tabular-nums">
                            {new Date(run.run_at).toLocaleString('en-IN')}
                          </TableCell>
                          <TableCell>
                            <Badge variant={run.is_dry_run ? 'outline' : 'default'}>
                              {run.is_dry_run ? 'Dry run' : 'Committed'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {run.learners_matched}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {run.bills_created}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}

      {/* Typed confirmation. Generation writes real financial records for
          hundreds of learners; a single click is too easy to do by accident. */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Generate fee bills?</DialogTitle>
            <DialogDescription>
              This creates real bills for <strong>{summary.billable}</strong> learner(s) across{' '}
              <strong>{summary.ready}</strong> class(es) in {yearName}, totalling{' '}
              <strong>₹{inr.format(summary.net)}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <Alert>
              <AlertDescription className="text-xs space-y-1">
                <p>
                  Learners who already have bills for these plans are skipped, so re-running is
                  safe.
                </p>
                <p>
                  Every plan billed becomes <strong>locked</strong> — changing its amounts
                  afterwards requires a new version.
                </p>
              </AlertDescription>
            </Alert>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-generate">
                Type <span className="font-mono font-semibold">{CONFIRM_WORD}</span> to confirm
              </Label>
              <Input
                id="confirm-generate"
                value={confirmText}
                autoComplete="off"
                onChange={(e) => setConfirmText(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={running}>
              Cancel
            </Button>
            <Button
              disabled={confirmText.trim() !== CONFIRM_WORD || running}
              onClick={async () => {
                await commit();
                setConfirmOpen(false);
                setConfirmText('');
              }}
            >
              {running ? 'Generating…' : 'Generate bills'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
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
