'use client';

/**
 * Enter — or correct — the days of someone with no biometric record.
 *
 * WHO THIS IS FOR. A person whose institution has no device, or whose punches
 * never arrived, has no attendance summary for the closed month and lands on
 * the register as Excluded. HR types their DAYS here; their PAY is computed by
 * the server from the salary in force with the register's own formula
 * (computeRegisterLine), so a hand-entered row cannot be paid on a different
 * rule from everyone around it. The preview below the form IS that computation,
 * run as a dry run — not a client-side estimate that could drift from it.
 *
 * Worked days are derived, never typed: working − leave − on duty − LOP. A row
 * therefore cannot be saved that fails to add up.
 *
 * Super admin and HR Head only (hr.payroll.register.manage); the route and RLS
 * refuse anyone else. Flex shell with its own scroll area — DialogContent sets
 * no max-height here and this form is taller than a laptop viewport.
 */

import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { getErrorMessage } from '@/lib/utils';
import {
  fetchManualEntryPreview,
  useManualEntryContext,
  useSaveManualEntry,
} from '@/hooks/hr/payroll/use-salary-register';
import {
  manualEntrySchema,
  manualPreviewSchema,
  type ManualEntryFormValues,
} from '@/lib/validations/salary-register-manual-entry';
import type {
  HRSalaryRegisterLine,
  ManualEntryContext,
  ManualEntryInput,
  ManualEntryResult,
} from '@/types/hr-payroll';

const inr = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const dayFmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

interface ManualEntryDialogProps {
  line: HRSalaryRegisterLine | null;
  runId: string;
  onOpenChange: (open: boolean) => void;
}

export function ManualEntryDialog({ line, runId, onOpenChange }: ManualEntryDialogProps) {
  const ctx = useManualEntryContext(line?.id ?? null);

  return (
    <Dialog open={Boolean(line)} onOpenChange={onOpenChange}>
      {line && (
        <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-xl">
          <DialogHeader className="shrink-0">
            <DialogTitle className="truncate">
              {line.entry_source === 'manual' ? 'Edit details' : 'Enter details'} — {line.staff_name}
            </DialogTitle>
            <DialogDescription>
              {line.employee_code ? `${line.employee_code} · ` : ''}
              No biometric attendance for this month. Enter the days; pay is calculated from the
              recorded salary, the same way as everyone else on the register.
            </DialogDescription>
          </DialogHeader>

          {ctx.isLoading && (
            <div className="space-y-3 py-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          )}

          {ctx.error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{getErrorMessage(ctx.error)}</AlertDescription>
            </Alert>
          )}

          {/* Mounted only once the context is in, and keyed on the row, so the
              form's defaults seed from the saved entry instead of from blanks. */}
          {ctx.data && (
            <ManualEntryForm
              key={line.id}
              lineId={line.id}
              runId={runId}
              context={ctx.data}
              onDone={() => onOpenChange(false)}
            />
          )}
        </DialogContent>
      )}
    </Dialog>
  );
}

const DAY_FIELDS: { name: keyof ManualEntryFormValues; label: string; hint?: string }[] = [
  { name: 'business_working_days', label: 'Working days', hint: 'Calendar − week-offs − holidays' },
  { name: 'casual_leave_days', label: 'Casual leave' },
  { name: 'comp_off_days', label: 'Comp off' },
  { name: 'other_paid_leave_days', label: 'Other paid leave' },
  { name: 'on_duty_days', label: 'On duty' },
  { name: 'unpaid_leave_days', label: 'LOP (unpaid)' },
];

function toNumber(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function ManualEntryForm({
  lineId,
  runId,
  context,
  onDone,
}: {
  lineId: string;
  runId: string;
  context: ManualEntryContext;
  onDone: () => void;
}) {
  const save = useSaveManualEntry(runId);
  const needsGross = context.recorded_gross === null;

  const form = useForm<ManualEntryFormValues>({
    resolver: zodResolver(manualEntrySchema),
    defaultValues: {
      business_working_days: context.saved?.business_working_days ?? context.working_days_basis,
      casual_leave_days: context.saved?.casual_leave_days ?? 0,
      comp_off_days: context.saved?.comp_off_days ?? 0,
      other_paid_leave_days: context.saved?.other_paid_leave_days ?? 0,
      on_duty_days: context.saved?.on_duty_days ?? 0,
      unpaid_leave_days: context.saved?.unpaid_leave_days ?? 0,
      monthly_gross: needsGross ? context.saved?.monthly_gross ?? null : null,
      reason: context.saved?.reason ?? '',
    },
  });

  const watched = useWatch({ control: form.control });
  const values = useMemo(
    () => ({
      business_working_days: toNumber(watched.business_working_days),
      casual_leave_days: toNumber(watched.casual_leave_days),
      comp_off_days: toNumber(watched.comp_off_days),
      other_paid_leave_days: toNumber(watched.other_paid_leave_days),
      on_duty_days: toNumber(watched.on_duty_days),
      unpaid_leave_days: toNumber(watched.unpaid_leave_days),
      monthly_gross: needsGross ? (toNumber(watched.monthly_gross) || null) : null,
    }),
    [watched, needsGross],
  );

  const worked = Math.max(
    0,
    values.business_working_days -
      values.casual_leave_days -
      values.comp_off_days -
      values.other_paid_leave_days -
      values.on_duty_days -
      values.unpaid_leave_days,
  );

  /*
   * LIVE PREVIEW — the server's own computation, debounced. Skipped while the
   * days do not validate (the field errors already say why) or while a gross
   * is required and missing; a stale preview is cleared rather than shown
   * against figures it no longer matches.
   */
  const [preview, setPreview] = useState<ManualEntryResult['figures'] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const previewKey = JSON.stringify(values);

  useEffect(() => {
    const parsed = manualPreviewSchema.safeParse(values);
    const ready = parsed.success && (!needsGross || (values.monthly_gross ?? 0) > 0);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (!ready) {
        setPreview(null);
        setPreviewError(null);
        return;
      }
      setPreviewing(true);
      try {
        const res = await fetchManualEntryPreview(lineId, values, controller.signal);
        setPreview(res.figures);
        setPreviewError(null);
      } catch (err) {
        if (controller.signal.aborted) return;
        setPreview(null);
        setPreviewError(getErrorMessage(err));
      } finally {
        if (!controller.signal.aborted) setPreviewing(false);
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // previewKey carries every value; `values` itself is a new object per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey, lineId, needsGross]);

  const onSubmit = (v: ManualEntryFormValues) => {
    // Validated by the resolver; the cast restores the required-ness z.infer
    // drops while strictNullChecks is off in this repo.
    const input = {
      ...v,
      monthly_gross: needsGross ? v.monthly_gross : null,
    } as ManualEntryInput;
    save.mutate(
      { lineId, input },
      {
        onSuccess: (res) => {
          toast.success(
            res.line ? `${res.line.staff_name} is now on the register — net ${inr(res.figures.net_pay)}.` : 'Saved.',
          );
          onDone();
        },
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-1 pb-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            {DAY_FIELDS.map((f) => (
              <FormField
                key={f.name}
                control={form.control}
                name={f.name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{f.label}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.5"
                        min={0}
                        max={31}
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    {f.hint && <FormDescription className="text-xs">{f.hint}</FormDescription>}
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <span>
              Worked days <strong className="tabular-nums">{dayFmt(worked)}</strong>
            </span>
            <span className="text-muted-foreground">= working − leave − on duty − LOP</span>
          </div>

          {needsGross ? (
            <FormField
              control={form.control}
              name="monthly_gross"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Monthly gross (₹)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={1}
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)}
                    />
                  </FormControl>
                  <FormDescription>
                    No salary is recorded for this person for the month, so enter it here. Record it in
                    Employee Salaries too, so next month is not entered by hand.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : (
            <div className="text-sm">
              <span className="text-muted-foreground">Monthly gross </span>
              <strong className="tabular-nums">{inr(context.recorded_gross as number)}</strong>
              <span className="text-muted-foreground"> — the recorded salary in force</span>
              {(context.epf > 0 || context.esi > 0 || context.allowance > 0) && (
                <span className="text-muted-foreground">
                  {context.allowance > 0 ? ` · allowance ${inr(context.allowance)}` : ''}
                  {context.epf > 0 ? ` · EPF ${inr(context.epf)}` : ''}
                  {context.esi > 0 ? ` · ESI ${inr(context.esi)}` : ''}
                </span>
              )}
            </div>
          )}

          <FormField
            control={form.control}
            name="reason"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Reason</FormLabel>
                <FormControl>
                  <Textarea
                    rows={2}
                    maxLength={300}
                    placeholder="e.g. No biometric device at this site — attendance from the register book"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Saved with your name and the time, shown on the row and printed in the workbook&apos;s Remarks.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* What the register will say — computed by the server. */}
          <section aria-label="Calculated pay" className="rounded-md border p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Calculated pay
              {previewing && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
            </div>
            {previewError && <p className="text-sm text-destructive">{previewError}</p>}
            {!previewError && !preview && (
              <p className="text-sm text-muted-foreground">
                {needsGross && !(values.monthly_gross ?? 0)
                  ? 'Enter the monthly gross to see the calculated pay.'
                  : 'Correct the days above to see the calculated pay.'}
              </p>
            )}
            {preview && (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                <div><dt className="text-xs text-muted-foreground">Paid days</dt><dd className="tabular-nums">{dayFmt(preview.paid_days)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Gross</dt><dd className="tabular-nums">{inr(preview.total_earnings)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">LOP deduction</dt><dd className="tabular-nums">{inr(preview.unpaid_leave_deduction)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">EPF</dt><dd className="tabular-nums">{inr(preview.epf_deduction)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">ESI</dt><dd className="tabular-nums">{inr(preview.esi_deduction)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">TDS</dt><dd className="tabular-nums">{inr(preview.tds_deduction)}</dd></div>
                {preview.adjustment_amount !== 0 && (
                  <div><dt className="text-xs text-muted-foreground">Adjustment</dt><dd className="tabular-nums">{inr(preview.adjustment_amount)}</dd></div>
                )}
                <div className="col-span-2 sm:col-span-3 mt-1 border-t pt-2">
                  <dt className="text-xs text-muted-foreground">Net pay</dt>
                  <dd className="text-lg font-semibold tabular-nums">{inr(preview.net_pay)}</dd>
                </div>
              </dl>
            )}
          </section>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onDone} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              'Save and pay'
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
