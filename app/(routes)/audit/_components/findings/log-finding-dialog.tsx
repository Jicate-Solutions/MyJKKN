'use client';

// Audit Workflow Sprint 01 — Log-finding dialog.
// Flow:
//  1. Pick cycle → populate parameter catalog (institution-scoped, override-merged)
//  2. Pick parameter → auto-loads framework_mapping + evidence_required via service
//  3. Pick severity + institution + notes → useLogFinding mutation
// Service-side fan-out fires on insert (PR-A6a trigger); we just invalidate.

import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Building2, CalendarClock, FileText, History, ShieldCheck } from 'lucide-react';
import { useAuditCycles } from '@/hooks/audit/use-audit-cycles';
import { useParametersForInstitution } from '@/hooks/audit/use-audit-parameters';
import { usePriorParameterResult } from '@/hooks/audit/use-audit-parameter-results';
import { useLogFinding, useFindingsByCycle } from '@/hooks/audit/use-audit-findings';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useAuth } from '@/hooks/use-auth';
import { getErrorMessage } from '@/lib/utils';
import type { FindingSeverity } from '@/lib/types/audit';
import { FrameworkMappingDisplay } from '../parameters/framework-mapping-display';
import { prettyRole } from '../redesign/kit';
import { isOpenFinding } from '../redesign/param-status';

// Remember the institution an auditor last logged a finding against. A walkthrough
// of one college produces many findings for the same institution, so pre-selecting
// the last pick removes a repeated click. Global (not per-cycle) on purpose.
const LAST_INSTITUTION_KEY = 'audit:last-institution-id';
function readLastInstitution(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(LAST_INSTITUTION_KEY);
  } catch {
    return null;
  }
}
function writeLastInstitution(id: string): void {
  if (typeof window === 'undefined' || !id) return;
  try {
    window.localStorage.setItem(LAST_INSTITUTION_KEY, id);
  } catch {
    /* localStorage unavailable (private mode / quota) — non-fatal */
  }
}

const logFindingSchema = z.object({
  audit_cycle_id: z.string().uuid('Select a cycle'),
  institution_id: z.string().uuid('Select an institution'),
  parameter_code: z.string().min(1, 'Select a parameter'),
  severity: z.enum(['red', 'yellow', 'green']),
  notes: z.string().max(2000, 'Notes must be 2000 chars or less').optional(),
});

type LogFindingFormValues = z.infer<typeof logFindingSchema>;

interface LogFindingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** If set, pre-selects this cycle and locks the field. */
  cycleId?: string;
  /** If set, pre-selects this parameter once the institution + catalog load
   *  (used by the parameter sheet's per-row "Log finding" so the auditor doesn't
   *  re-pick a parameter they already had open). */
  initialParameterCode?: string;
  /** Optional success callback (fires after each logged finding). */
  onSuccess?: (findingId: string) => void;
}

export function LogFindingDialog({
  open,
  onOpenChange,
  cycleId,
  initialParameterCode,
  onSuccess,
}: LogFindingDialogProps) {
  const { profile } = useAuth();
  const requesterId = profile?.id ?? '';
  const logMut = useLogFinding(requesterId);

  const form = useForm<LogFindingFormValues>({
    resolver: zodResolver(logFindingSchema),
    defaultValues: {
      audit_cycle_id: cycleId ?? '',
      institution_id: '',
      parameter_code: '',
      severity: 'yellow' as FindingSeverity,
      notes: '',
    },
  });

  // Reset form when the dialog opens/closes (avoid stale values across sessions)
  useEffect(() => {
    if (open) {
      form.reset({
        audit_cycle_id: cycleId ?? '',
        institution_id: '',
        parameter_code: '',
        severity: 'yellow',
        notes: '',
      });
    }
  }, [open, cycleId, form]);

  const { data: cycles = [], isLoading: cyclesLoading } = useAuditCycles({
    includeClosed: false,
  });
  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess();

  const selectedInstitutionId = form.watch('institution_id');
  const { data: parameters = [], isLoading: paramsLoading } = useParametersForInstitution(
    selectedInstitutionId || undefined
  );

  // Watch the cycle id explicitly so the derived cycle (and its institution scope)
  // stays in sync — memoizing on `form` alone leaves it stale when the cycle changes.
  const watchedCycleId = form.watch('audit_cycle_id');
  const selectedCycle = useMemo(
    () => cycles.find((c) => c.id === watchedCycleId),
    [cycles, watchedCycleId]
  );

  // Routing rule (Director decision): the standing "Whole Institution" cycle logs
  // findings ONLY against org-wide checks (loop health, exam integrity); every
  // per-college cycle EXCLUDES them. Mirror the parameter-sheet routing so the
  // dropdown never offers a parameter that doesn't belong to this cycle type.
  // Missing is_org_wide (older frozen catalog rows) counts as false.
  const visibleParameters = useMemo(
    () =>
      parameters.filter((p) =>
        selectedCycle?.is_standing ? p.is_org_wide === true : !p.is_org_wide,
      ),
    [parameters, selectedCycle?.is_standing]
  );

  // Institutions a finding can be filed against for the selected cycle. A cycle's
  // `institution_ids` NULL = all accessible; a non-empty list scopes to that subset.
  // Filtering here both prevents out-of-scope findings and, when it narrows to one,
  // lets us auto-select it. Fall back to the full list if the cycle scopes only
  // institutions the auditor can't access (never strand them with an empty picker).
  const scopedInstitutions = useMemo(() => {
    const ids = selectedCycle?.institution_ids;
    if (!ids || ids.length === 0) return institutions;
    const allowed = new Set(ids);
    const filtered = institutions.filter((i) => allowed.has(i.id));
    return filtered.length ? filtered : institutions;
  }, [institutions, selectedCycle]);

  // Auto-select the institution: exactly one in-scope option → pick it; otherwise
  // restore the auditor's last pick if it's still a valid option. Keeps a valid
  // manual/existing choice, and re-defaults in one pass when a cycle change makes
  // the current pick out-of-scope.
  useEffect(() => {
    if (!open || institutionsLoading || !scopedInstitutions.length) return;
    const current = form.getValues('institution_id');
    const currentValid = !!current && scopedInstitutions.some((i) => i.id === current);
    if (currentValid) return;

    let next = '';
    if (scopedInstitutions.length === 1) {
      next = scopedInstitutions[0].id;
    } else {
      const last = readLastInstitution();
      if (last && scopedInstitutions.some((i) => i.id === last)) next = last;
    }
    if (next !== current) {
      form.setValue('institution_id', next);
      form.setValue('parameter_code', '');
    }
  }, [open, institutionsLoading, scopedInstitutions, form]);

  const watchedParameterCode = form.watch('parameter_code');

  // Pre-select an initial parameter (from the parameter sheet's per-row "Log
  // finding") once the institution is chosen and the catalog has loaded it. Runs
  // after the open-reset that clears it, so the deep-linked parameter wins.
  useEffect(() => {
    if (!open || !initialParameterCode || paramsLoading) return;
    if (watchedParameterCode === initialParameterCode) return;
    if (parameters.some((p) => p.code === initialParameterCode)) {
      form.setValue('parameter_code', initialParameterCode);
    }
  }, [open, initialParameterCode, parameters, paramsLoading, watchedParameterCode, form]);

  // The catalog row for the selected parameter — powers the context panel so the
  // auditor sees what they're filing against (meaning, evidence, owner), not a bare code.
  const selectedParam = useMemo(
    () => parameters.find((p) => p.code === watchedParameterCode) ?? null,
    [parameters, watchedParameterCode]
  );

  // Findings already on this cycle → how many are OPEN on the exact parameter +
  // institution about to be filed against. Context (a heads-up), not a block.
  const { data: cycleFindings = [] } = useFindingsByCycle(watchedCycleId || undefined);
  const openFindingsHere = useMemo(() => {
    if (!selectedParam || !selectedInstitutionId) return 0;
    return cycleFindings.filter(
      (f) =>
        f.parameter_code === selectedParam.code &&
        f.institution_id === selectedInstitutionId &&
        isOpenFinding(f)
    ).length;
  }, [cycleFindings, selectedParam, selectedInstitutionId]);

  // This college's LAST-cycle result for the exact parameter about to be filed
  // against — "how did we do here last time" context (only fetched once all three
  // keys are set). null when the pair has never been scored in a prior cycle.
  const { data: priorResult } = usePriorParameterResult(
    watchedCycleId || undefined,
    selectedParam?.code,
    selectedInstitutionId || undefined
  );

  // Pre-select the parameter's own default severity whenever the parameter changes
  // (culture params → observation, others → needs-attention). The auditor can still
  // override; picking a different parameter re-applies that parameter's default.
  useEffect(() => {
    if (selectedParam?.default_severity) {
      form.setValue('severity', selectedParam.default_severity);
    }
  }, [selectedParam?.code, selectedParam?.default_severity, form]);

  // The real due window comes from the SELECTED parameter's own SLA (p1/p2_sla_days),
  // not a generic "P2 SLA" label. Green (observation) carries no deadline.
  const watchedSeverity = form.watch('severity');
  const dueInfo = useMemo(() => {
    if (!selectedParam) return null;
    if (watchedSeverity === 'green') return { days: null as number | null, text: 'Observation — no deadline' };
    const days = watchedSeverity === 'red' ? selectedParam.p1_sla_days : selectedParam.p2_sla_days;
    return { days, text: `Owner due in ${days} day${days === 1 ? '' : 's'}` };
  }, [selectedParam, watchedSeverity]);

  async function submitFinding(values: LogFindingFormValues, keepOpen: boolean) {
    if (!requesterId) {
      toast.error('You must be signed in to log a finding.');
      return;
    }
    try {
      const result = await logMut.mutateAsync({
        audit_cycle_id: values.audit_cycle_id,
        parameter_code: values.parameter_code,
        severity: values.severity,
        institution_id: values.institution_id,
        notes: values.notes,
      });
      writeLastInstitution(values.institution_id);
      toast.success(`Finding logged (${result.request_number ?? result.finding_id.slice(0, 8)}).`);
      onSuccess?.(result.finding_id);
      if (keepOpen) {
        // Keep cycle + institution; clear only what changes per finding, so a
        // walkthrough of one college logs many findings without re-picking.
        form.setValue('parameter_code', '');
        form.setValue('severity', 'yellow');
        form.setValue('notes', '');
      } else {
        onOpenChange(false);
      }
    } catch (err) {
      toast.error(`Failed to log finding: ${getErrorMessage(err)}`);
    }
  }

  const submitting = logMut.isPending;
  const canSubmit =
    !!form.watch('audit_cycle_id') &&
    !!form.watch('institution_id') &&
    !!form.watch('parameter_code') &&
    !submitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Log audit finding</DialogTitle>
          <DialogDescription>
            Create a new audit finding tracked as a service request. The assigned owner is
            auto-resolved from the parameter catalog.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => submitFinding(v, false))}
            className="space-y-4"
          >
            {/* Cycle */}
            <FormField
              control={form.control}
              name="audit_cycle_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Audit cycle</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={!!cycleId || cyclesLoading}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={cyclesLoading ? 'Loading cycles…' : 'Select a cycle'}
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {cycles.map((cycle) => (
                        <SelectItem key={cycle.id} value={cycle.id}>
                          {cycle.name} · {cycle.phase}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedCycle?.frameworks?.length ? (
                    <FormDescription>
                      Frameworks: {selectedCycle.frameworks.join(', ')}
                    </FormDescription>
                  ) : null}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Institution — when the cycle scopes exactly one college (a per-college
                cycle), it's fixed and shown read-only so the auditor never re-picks it.
                Otherwise (a cycle spanning colleges) it's a picker. */}
            <FormField
              control={form.control}
              name="institution_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Institution</FormLabel>
                  {scopedInstitutions.length === 1 ? (
                    <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                      <Building2 className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <span className="font-medium">{scopedInstitutions[0].name}</span>
                      <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">
                        this cycle&apos;s college
                      </span>
                    </div>
                  ) : (
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v);
                        // Reset parameter when institution changes — override-merged list will refetch
                        form.setValue('parameter_code', '');
                      }}
                      disabled={institutionsLoading}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              institutionsLoading ? 'Loading institutions…' : 'Select an institution'
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {scopedInstitutions.map((inst) => (
                          <SelectItem key={inst.id} value={inst.id}>
                            {inst.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Parameter */}
            <FormField
              control={form.control}
              name="parameter_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Parameter</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={!selectedInstitutionId || paramsLoading}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            !selectedInstitutionId
                              ? 'Select an institution first'
                              : paramsLoading
                                ? 'Loading parameters…'
                                : 'Select a parameter'
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="max-h-72">
                      {visibleParameters.map((p) => (
                        <SelectItem key={`${p.code}-${p.institution_id ?? 'sys'}`} value={p.code}>
                          <span className="font-mono text-xs mr-2">{p.code}</span>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Parameter context — shown the moment a parameter is picked, so the
                auditor knows what they're filing against instead of a bare code. */}
            {selectedParam && (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium leading-snug">{selectedParam.name}</p>
                    {selectedParam.description ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {selectedParam.description}
                      </p>
                    ) : null}
                  </div>
                  {selectedParam.default_owner_role ? (
                    <span className="flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-full border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                      <ShieldCheck className="h-3 w-3" />
                      {prettyRole(selectedParam.default_owner_role)}
                    </span>
                  ) : null}
                </div>

                {Object.keys(selectedParam.framework_mapping ?? {}).length > 0 && (
                  <FrameworkMappingDisplay
                    mapping={selectedParam.framework_mapping}
                    variant="inline"
                  />
                )}

                {selectedParam.evidence_required?.length ? (
                  <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <FileText className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    <span>
                      <span className="font-medium text-foreground">Evidence:</span>{' '}
                      {selectedParam.evidence_required
                        .map((e) => e.label + (e.required ? '' : ' (optional)'))
                        .join(' · ')}
                    </span>
                  </div>
                ) : null}

                {priorResult && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <History className="h-3.5 w-3.5 flex-shrink-0" />
                    {priorResult.finding_count > 0 ? (
                      <span>
                        Last cycle:{' '}
                        <span className="font-medium text-foreground">{priorResult.verdict}</span> —{' '}
                        {priorResult.finding_count} finding{priorResult.finding_count === 1 ? '' : 's'},{' '}
                        {priorResult.open_finding_count} still open
                      </span>
                    ) : (
                      <span>Last cycle: clean</span>
                    )}
                  </div>
                )}

                {openFindingsHere > 0 && (
                  <div className="flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                    {openFindingsHere} open finding{openFindingsHere === 1 ? '' : 's'} already
                    logged here — check before adding another.
                  </div>
                )}
              </div>
            )}

            {/* Severity — pre-set from the parameter; the due window is the parameter's
                own SLA, shown as a real deadline instead of a generic "P2 SLA" label. */}
            <FormField
              control={form.control}
              name="severity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Severity</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="red">Red — critical</SelectItem>
                      <SelectItem value="yellow">Yellow — needs attention</SelectItem>
                      <SelectItem value="green">Green — observation</SelectItem>
                    </SelectContent>
                  </Select>
                  {dueInfo && (
                    <FormDescription className="flex items-center gap-1.5">
                      <CalendarClock className="h-3.5 w-3.5 flex-shrink-0" />
                      {dueInfo.text}
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe the gap, the evidence reviewed, and any context for the owner."
                      rows={4}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2 pt-2 sm:justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!canSubmit}
                  onClick={form.handleSubmit((v) => submitFinding(v, true))}
                  title="Log this finding and keep the dialog open for the next one on this college"
                >
                  {submitting ? 'Logging…' : 'Log & add another'}
                </Button>
                <Button type="submit" disabled={!canSubmit}>
                  {submitting ? 'Logging…' : 'Log finding'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
