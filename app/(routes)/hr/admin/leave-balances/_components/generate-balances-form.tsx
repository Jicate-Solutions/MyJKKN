'use client';

/**
 * The balance generator.
 *
 * Was one organization at a time, because it had to be: academic_years rows are
 * per-institution, so every organization needed its own year id and several
 * institutions had none at all. hr_academic_years is group-wide, so one id now
 * covers everyone and the form provisions as many institutions as you tick.
 *
 * The institution list comes from the SAME RPC the Analytics tab renders, so
 * the statuses shown here cannot disagree with the gaps panel next door. That
 * matters: previously the report knew exactly who needed generating and the
 * form was blind to it, so the operator re-selected by hand what the other tab
 * had already worked out.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useLeaveBalanceAnalytics, useGenerateBalancesBulk } from '@/hooks/hr/use-hr-leave-types';
import type { GenerateBalancesBulkResult } from '@/lib/services/hr/leave-type-service';
import { cn, getErrorMessage } from '@/lib/utils';

import { BLOCKED, NEEDS_GENERATION, STATUS_META, fmt } from './coverage-status';

export function GenerateBalancesForm({ year }: { year: string | null }) {
  const { data, isLoading } = useLeaveBalanceAnalytics(year);
  const mutation = useGenerateBalancesBulk();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<GenerateBalancesBulkResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const institutions = useMemo(() => data?.institutions ?? [], [data?.institutions]);

  // The generator physically cannot fix a no_types / no_staff org, so those
  // rows are not selectable — queueing them would write nothing and still
  // report success, which is how an operator concludes the run "worked".
  const selectable = useMemo(
    () => institutions.filter((i) => !BLOCKED.includes(i.status) && i.status !== 'no_staff'),
    [institutions]
  );
  const needing = useMemo(
    () => selectable.filter((i) => NEEDS_GENERATION.includes(i.status)),
    [selectable]
  );

  const resolvedYearId = data?.hr_academic_year_id ?? null;

  const toggle = (orgId: string) => {
    setResult(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(orgId)) next.delete(orgId);
      else next.add(orgId);
      return next;
    });
  };

  const selectNeeding = () => {
    setResult(null);
    setSelected(new Set(needing.map((i) => i.org_id)));
  };

  const selectAll = () => {
    setResult(null);
    setSelected(new Set(selectable.map((i) => i.org_id)));
  };

  const clear = () => {
    setResult(null);
    setSelected(new Set());
  };

  const run = async (dryRun: boolean) => {
    if (!resolvedYearId) return;
    setError(null);
    try {
      const res = await mutation.mutateAsync({
        hrAcademicYearId: resolvedYearId,
        hrOrgIds: Array.from(selected),
        dryRun,
      });
      setResult(res);
    } catch (err) {
      // Supabase errors are plain objects, not Error instances.
      setError(getErrorMessage(err));
      setResult(null);
    }
  };

  const canRun = !!resolvedYearId && selected.size > 0 && !mutation.isPending;
  // Generate stays shut until a dry run for the CURRENT selection has been
  // seen. Changing the selection clears `result`, so the gate re-arms.
  const canGenerate = canRun && result?.dry_run === true;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!resolvedYearId) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          No HR academic year is selected or configured, so balances cannot be generated.
          Create one in{' '}
          <Link href="/hr/admin/academic-years" className="underline underline-offset-2">
            HR Academic Years
          </Link>
          , then select it above.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Run this <strong>before</strong> team members apply for leave. Approving leave with no
          balance row creates one with zero entitlement and non-zero usage, leaving a
          permanently negative balance. Always preview first.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Institutions to provision for {data?.year_name}
          </CardTitle>
          <CardDescription>
            Statuses are live, from the same source as the Analytics tab. Institutions with no
            leave types or no team members cannot be generated and are not selectable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={selectNeeding}
              disabled={needing.length === 0}
            >
              Select all needing ({needing.length})
            </Button>
            <Button variant="outline" size="sm" onClick={selectAll}>
              Select all ({selectable.length})
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clear}
              disabled={selected.size === 0}
            >
              Clear
            </Button>
            <span className="ml-auto text-sm text-muted-foreground">
              {selected.size} selected
            </span>
          </div>

          <div className="divide-y rounded-md border">
            {institutions.map((i) => {
              const meta = STATUS_META[i.status];
              const disabled = BLOCKED.includes(i.status) || i.status === 'no_staff';
              const checked = selected.has(i.org_id);
              const uncovered = i.active_staff - i.staff_covered;

              return (
                <label
                  key={i.org_id}
                  htmlFor={`org-${i.org_id}`}
                  className={cn(
                    'flex items-center gap-3 p-3 text-sm',
                    disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-muted/40'
                  )}
                >
                  <Checkbox
                    id={`org-${i.org_id}`}
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={() => toggle(i.org_id)}
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {i.institution_name}
                  </span>
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                    {fmt(i.active_staff)} staff
                    {uncovered > 0 && ` · ${fmt(uncovered)} uncovered`}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn('shrink-0 font-normal', meta.tone)}
                    title={meta.hint}
                  >
                    {meta.label}
                  </Badge>
                </label>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!canRun} onClick={() => run(true)}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Preview (dry run)
            </Button>
            <Button disabled={!canGenerate} onClick={() => run(false)}>
              Generate
              {selected.size > 0 && ` · ${selected.size} institution${selected.size === 1 ? '' : 's'}`}
            </Button>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {result && <BulkResult result={result} />}
        </CardContent>
      </Card>
    </div>
  );
}

function BulkResult({ result }: { result: GenerateBalancesBulkResult }) {
  const verb = result.dry_run ? 'Would create' : 'Created';
  const failed = result.results.filter((r) => r.error);

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="flex items-center gap-2 font-medium">
        <CheckCircle2 className="h-4 w-4" />
        {result.dry_run ? 'Preview' : 'Generated'} · {result.year_name}
      </div>

      <p className="text-sm">
        {verb} <strong>{fmt(result.total_created)}</strong> balance rows across{' '}
        <strong>{result.organizations}</strong> institution
        {result.organizations === 1 ? '' : 's'}
        {result.total_skipped > 0 && (
          <> · <strong>{fmt(result.total_skipped)}</strong> already existed</>
        )}
      </p>

      {result.dry_run && result.total_created === 0 && (
        <p className="text-xs text-muted-foreground">
          Nothing to create — every staff × leave-type pair already has a balance row for this
          year. Generating would make no changes.
        </p>
      )}

      {/* error_count is checked explicitly: each institution runs in its own
          subtransaction, so a partly-failed run still reports totals and would
          otherwise read as a clean success. */}
      {result.error_count > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <p className="font-medium">
              {result.error_count} institution{result.error_count === 1 ? '' : 's'} failed. The
              rest completed.
            </p>
            <ul className="mt-1 list-disc pl-5">
              {failed.map((r) => (
                <li key={r.hr_organization_id}>
                  {r.institution_name} — {r.error}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="divide-y rounded-md border">
        {result.results.map((r) => (
          <div
            key={r.hr_organization_id}
            className="flex items-center gap-3 px-3 py-2 text-sm"
          >
            <span className="min-w-0 flex-1 truncate">{r.institution_name}</span>
            {r.error ? (
              <span className="shrink-0 text-xs text-destructive">failed</span>
            ) : (
              <span className="shrink-0 text-xs text-muted-foreground">
                {verb.toLowerCase()} {fmt(r.created)}
                {r.skipped > 0 && ` · ${fmt(r.skipped)} existed`}
                {r.fallback_count > 0 && ` · ${fmt(r.fallback_count)} on type default`}
              </span>
            )}
          </div>
        ))}
      </div>

      {result.total_fallback > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            {fmt(result.total_fallback)} used the leave type default because no cadre
            entitlement resolved
          </summary>
          <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">
            {result.results
              .filter((r) => r.fallback_count > 0)
              .map((r) => (
                <div key={r.hr_organization_id}>
                  <p className="text-xs font-medium">{r.institution_name}</p>
                  <ul className="list-disc pl-5 text-xs text-muted-foreground">
                    {r.fallback.slice(0, 50).map((f, idx) => (
                      <li key={`${f.staff_code}-${idx}`}>
                        {f.staff_code} {f.name} — {f.reason}
                      </li>
                    ))}
                  </ul>
                  {r.fallback.length > 50 && (
                    <p className="pl-5 text-xs text-muted-foreground">
                      …and {r.fallback.length - 50} more
                    </p>
                  )}
                </div>
              ))}
          </div>
        </details>
      )}
    </div>
  );
}
