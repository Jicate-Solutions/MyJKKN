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
import { useAuditCycles } from '@/hooks/audit/use-audit-cycles';
import { useParametersForInstitution } from '@/hooks/audit/use-audit-parameters';
import { useLogFinding } from '@/hooks/audit/use-audit-findings';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useAuth } from '@/hooks/use-auth';
import type { FindingSeverity } from '@/lib/types/audit';

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
  /** Optional success callback (dialog auto-closes regardless). */
  onSuccess?: (findingId: string) => void;
}

export function LogFindingDialog({
  open,
  onOpenChange,
  cycleId,
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

  const selectedCycle = useMemo(
    () => cycles.find((c) => c.id === form.watch('audit_cycle_id')),
    [cycles, form]
  );

  async function onSubmit(values: LogFindingFormValues) {
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
      toast.success(`Finding logged (${result.request_number ?? result.finding_id.slice(0, 8)}).`);
      onOpenChange(false);
      onSuccess?.(result.finding_id);
    } catch (err) {
      toast.error(
        `Failed to log finding: ${err instanceof Error ? err.message : String(err)}`
      );
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
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

            {/* Institution */}
            <FormField
              control={form.control}
              name="institution_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Institution</FormLabel>
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
                      {institutions.map((inst) => (
                        <SelectItem key={inst.id} value={inst.id}>
                          {inst.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                      {parameters.map((p) => (
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

            {/* Severity */}
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
                      <SelectItem value="red">Red — critical / P1 SLA</SelectItem>
                      <SelectItem value="yellow">Yellow — warning / P2 SLA</SelectItem>
                      <SelectItem value="green">Green — observation</SelectItem>
                    </SelectContent>
                  </Select>
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

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {submitting ? 'Logging…' : 'Log finding'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
