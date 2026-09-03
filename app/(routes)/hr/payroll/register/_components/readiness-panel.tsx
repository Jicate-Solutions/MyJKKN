'use client';

/**
 * The readiness panel — why a register can or cannot be generated.
 *
 * BLOCKERS ARE RENDERED VERBATIM. The service composes them with the count and
 * the institution already in the sentence ("July 2026 is not closed for JKKN
 * Main Office (10 of these staff work there)"), because a register can depend
 * on a month belonging to an institution the user was not even looking at. A
 * generic "not ready" would send HR to the wrong screen.
 *
 * Warnings never block. Missing salaries, blank bank accounts and a high
 * half-day count are all things only HR can judge — the register states them
 * and carries on.
 */

import {
  AlertTriangle,
  CalendarCheck,
  CalendarX,
  CheckCircle2,
  Info,
  Loader2,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { SalaryRegisterPreflight } from '@/types/hr-payroll';

interface ReadinessPanelProps {
  preflight: SalaryRegisterPreflight | undefined;
  isLoading: boolean;
  error: Error | null;
  canManage: boolean;
  isGenerating: boolean;
  onGenerate: () => void;
}

function Stat({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <div className={`text-2xl font-semibold ${muted ? 'text-muted-foreground' : ''}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export function ReadinessPanel({
  preflight,
  isLoading,
  error,
  canManage,
  isGenerating,
  onGenerate,
}: ReadinessPanelProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking whether this month can be generated…
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Could not check readiness</AlertTitle>
        {/* Verbatim: the service names the missing permission key when a read
            came back empty because of RLS rather than because it was empty. */}
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  if (!preflight) return null;

  const { blockers, warnings, dependencies } = preflight;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="HR staff working here" value={preflight.roster_count} />
            <Stat label="Ready to be paid" value={preflight.payable_count} />
            <Stat
              label="No salary recorded"
              value={preflight.missing_salary_count}
              muted={preflight.missing_salary_count === 0}
            />
            <Stat
              label="No bank account"
              value={preflight.missing_bank_count}
              muted={preflight.missing_bank_count === 0}
            />
          </div>

          {/* One row per WORK LOCATION on the roster, not just the paying
              institution. Usually a single row; several when the institution
              pays people who work elsewhere. */}
          {dependencies.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium">
                {dependencies.length === 1 ? 'Attendance month this register needs' : 'Attendance months this register needs'}
              </div>
              <div className="divide-y divide-border rounded-md border border-border">
                {dependencies.map((d) => (
                  <div
                    key={d.institution_id}
                    className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {d.status === 'locked' ? (
                        <CalendarCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                      ) : (
                        <CalendarX className="h-4 w-4 shrink-0 text-amber-600" />
                      )}
                      <span className="truncate">{d.institution_name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {d.staff_count} staff
                      </span>
                    </div>
                    <Badge
                      variant={d.status === 'locked' ? 'secondary' : 'outline'}
                      className="shrink-0"
                    >
                      {d.status === 'locked'
                        ? `Closed · ${d.working_days_count ?? '?'} working days`
                        : d.status === 'open'
                          ? 'Still open'
                          : 'Never opened'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {preflight.working_days_basis ? (
            <p className="text-xs text-muted-foreground">
              Day rate will divide each salary by{' '}
              <strong>{preflight.working_days_basis} working days</strong> — the month standard for
              this institution, so a mid-month joiner is paid pro rata rather than a full month.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {blockers.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {blockers.length === 1 ? 'This month cannot be generated yet' : `${blockers.length} things block this month`}
          </AlertTitle>
          <AlertDescription>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {warnings.length > 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Worth checking before you issue this</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {blockers.length === 0 && warnings.length === 0 && (
        <Alert>
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <AlertTitle>Ready</AlertTitle>
          <AlertDescription>
            Every attendance month this register depends on is closed, and all{' '}
            {preflight.payable_count} staff have a recorded salary.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={onGenerate}
          disabled={!preflight.can_generate || !canManage || isGenerating}
        >
          {isGenerating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating…
            </>
          ) : preflight.existing_run_id ? (
            'Regenerate register'
          ) : (
            'Generate register'
          )}
        </Button>

        {!canManage && (
          <span className="text-xs text-muted-foreground">
            Generating requires hr.payroll.register.manage.
          </span>
        )}

        {/* Regeneration is not destructive — the previous run is superseded and
            stays readable — but any hand-entered adjustments were on THAT run
            and do not carry over. Say so before the click, not after. */}
        {preflight.existing_run_id && preflight.can_generate && (
          <span className="text-xs text-amber-600 dark:text-amber-500">
            A register already exists for this month. Regenerating supersedes it, and any
            adjustments recorded on it will not carry over.
          </span>
        )}
      </div>
    </div>
  );
}
