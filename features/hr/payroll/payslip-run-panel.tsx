'use client';

/**
 * PayslipRunPanel — make the payslips for a prepared period, and SHOW WHAT THE
 * RUN SAID (W12 review, 30 Sep 2026).
 *
 * The run's warnings ("3 people are marked for PF but no PF amount is typed",
 * "2 people's salary starts after this month") and the people it left off used
 * to live only in the HTTP response, which nothing read: no screen called the
 * generate route. Now:
 *   - a prepared period with no payslips gets a "Make payslips" button;
 *   - the result is shown straight away;
 *   - and it is KEPT: the run saves the same notes on the period
 *     (hr_payroll_periods.generation_notes), so they are still here after a
 *     reload, for everyone who opens the period.
 */

import { useState } from 'react';
import { AlertTriangle, FileCheck2, Info, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { useGeneratePayslips } from '@/hooks/hr/payroll/use-payroll-payslips';
import { usePermissions } from '@/hooks/use-permissions';
import type { HRPayrollPeriod, PayslipRunNotes } from '@/types/hr-payroll';

interface PayslipRunPanelProps {
  period: HRPayrollPeriod;
  payslipCount: number;
  payslipsLoading: boolean;
}

export function PayslipRunPanel({ period, payslipCount, payslipsLoading }: PayslipRunPanelProps) {
  const generate = useGeneratePayslips();
  // The run needs hr.payroll.manage on the server (403 otherwise). Principals,
  // accounts and the CAO hold only hr.payroll.view: no button for them, rather
  // than a button that fails after the click (reviewer, 30 Sep).
  const { hasAnyPermission: canManage } = usePermissions(['hr.payroll.manage']);
  const [fresh, setFresh] = useState<PayslipRunNotes | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const canGenerate =
    canManage && period.status === 'prepared' && !payslipsLoading && payslipCount === 0;
  const notes = fresh ?? period.generation_notes ?? null;

  function handleGenerate() {
    setRefusal(null);
    generate.mutate(
      { periodId: period.id },
      {
        onSuccess: (res) => {
          setFresh({
            generated_at: new Date().toISOString(),
            generated: res.data.generated,
            skipped: res.data.skipped,
            warnings: res.data.warnings,
            skipped_people: res.data.errors,
          });
          toast.success(res.message);
        },
        onError: (err) => {
          setRefusal(err.message);
          toast.error(err.message);
        },
      },
    );
  }

  if (!canGenerate && !notes && !refusal) return null;

  return (
    <Card data-testid="payslip-run-panel">
      <CardHeader>
        <CardTitle className="text-base">
          {notes ? 'What the last payslip run said' : 'Make the payslips'}
        </CardTitle>
        <CardDescription>
          {notes
            ? `Run on ${new Date(notes.generated_at).toLocaleString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}: ${notes.generated} payslip(s) made, ${notes.skipped} person(s) left off. These notes stay here.`
            : 'Pay comes from each person’s salary in force for this month. Check absence and pay first; then make the payslips.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {canGenerate && (
          <Button onClick={handleGenerate} disabled={generate.isPending} data-testid="generate-payslips">
            {generate.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileCheck2 className="mr-2 h-4 w-4" />
            )}
            Make payslips
          </Button>
        )}

        {refusal && (
          <Alert variant="destructive" data-testid="payslip-run-refusal">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>The payslips were not made</AlertTitle>
            <AlertDescription>{refusal}</AlertDescription>
          </Alert>
        )}

        {notes && notes.warnings.length > 0 && (
          <Alert data-testid="payslip-run-warnings">
            <Info className="h-4 w-4" />
            <AlertTitle>Check these before paying</AlertTitle>
            <AlertDescription>
              <ul className="ml-4 list-disc space-y-1">
                {notes.warnings.map((w, i) => (
                  <li key={`${i}-${w}`}>{w}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {notes && notes.skipped_people.length > 0 && (
          <div data-testid="payslip-run-skipped" className="rounded-md border border-border">
            <p className="border-b border-border bg-muted/40 px-3 py-2 text-sm font-medium">
              Left off this payroll ({notes.skipped_people.length}) — not paid by this run; the reason under each name says why
            </p>
            <ul className="divide-y divide-border text-sm">
              {notes.skipped_people.map((p) => (
                <li key={p.staff_id} className="px-3 py-2">
                  <span className="font-medium text-foreground">{p.name}</span>
                  <span className="block text-muted-foreground">{p.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
