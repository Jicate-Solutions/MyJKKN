'use client';
// ============================================
// TRANSFER ENQUIRY DIALOG
// ============================================
// Created: 2026-04-17
// Purpose: Transfer an enquiry to a different institution. Regenerates
// application_id via target institution's counselling code, resets
// institution-specific fields, and logs the transfer to profile_change_audit_log.
// ============================================

import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, ArrowRightLeft, AlertTriangle } from 'lucide-react';

import type { LearnerProfile } from '@/types/learner-profile';
import { CourseSelectionSection } from './form-sections/course-selection';
import { useTransferEnquiry } from '@/hooks/use-learner-profiles';
import {
  transferEnquirySchema,
  type TransferEnquiryInput,
} from '@/lib/validations/transfer-enquiry';

interface TransferEnquiryDialogProps {
  enquiry: LearnerProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTransferred?: (result: { application_id: string; institution_id: string }) => void;
}

export function TransferEnquiryDialog({
  enquiry,
  open,
  onOpenChange,
  onTransferred,
}: TransferEnquiryDialogProps) {
  const transfer = useTransferEnquiry();

  const defaultValues = useMemo<TransferEnquiryInput>(
    () => ({
      institution_id: '',
      degree_id: '',
      department_id: '',
      program_id: '',
      semester_id: '',
      section_id: '',
      academic_year_id: '',
      regulation_id: '',
      batch_id: '',
      reason: '',
      confirm: false as unknown as true,
    }),
    []
  );

  const form = useForm<TransferEnquiryInput>({
    resolver: zodResolver(transferEnquirySchema),
    defaultValues,
    mode: 'onBlur',
  });

  // Reset form whenever dialog opens so stale state doesn't bleed between uses.
  useEffect(() => {
    if (open) {
      form.reset(defaultValues);
    }
  }, [open, form, defaultValues]);

  const watchedInstitutionId = form.watch('institution_id');
  const sameInstitutionSelected =
    !!watchedInstitutionId && watchedInstitutionId === enquiry.institution_id;

  const onSubmit = async (values: TransferEnquiryInput) => {
    if (sameInstitutionSelected) {
      form.setError('institution_id', {
        message: 'New institution must differ from the current institution',
      });
      return;
    }

    try {
      const result = await transfer.mutateAsync({
        learnerId: enquiry.id,
        newInstitutionId: values.institution_id,
        newDegreeId: values.degree_id,
        newDepartmentId: values.department_id,
        newProgramId: values.program_id,
        newSemesterId: values.semester_id || null,
        newSectionId: values.section_id || null,
        newAcademicYearId: values.academic_year_id || null,
        newRegulationId: values.regulation_id || null,
        newBatchId: values.batch_id || null,
        reason: values.reason,
      });

      toast.success(
        `Transferred. New Application ID: ${result.application_id}`,
        { duration: 5000 }
      );
      onTransferred?.({
        application_id: result.application_id,
        institution_id: result.institution_id,
      });
      onOpenChange(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to transfer enquiry';
      toast.error(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-indigo-600" />
            Transfer Enquiry to Another Institution
          </DialogTitle>
          <DialogDescription>
            Move this enquiry to a different institution. The Application ID
            will be regenerated using the target institution&apos;s counselling
            code, and institution-specific fields (degree, department, program,
            semester, section, roll number) will be reset.
          </DialogDescription>
        </DialogHeader>

        {/* Current snapshot */}
        <div className="rounded-md border bg-muted/40 p-4 text-sm">
          <div className="font-medium mb-2">Current</div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1">
            <dt className="text-muted-foreground">Application ID</dt>
            <dd className="font-mono">
              {enquiry.application_id || <span className="italic">— none —</span>}
            </dd>
            <dt className="text-muted-foreground">Learner</dt>
            <dd>
              {enquiry.first_name} {enquiry.last_name || ''}
            </dd>
            <dt className="text-muted-foreground">Status</dt>
            <dd className="capitalize">{enquiry.lifecycle_status}</dd>
          </dl>
        </div>

        <Alert variant="default" className="border-amber-200 bg-amber-50 text-amber-900">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Heads up</AlertTitle>
          <AlertDescription>
            The old Application ID will not be recoverable, but a complete record
            of this transfer (before/after values) will be saved to the audit
            log. Transfers are blocked once billing has started.
          </AlertDescription>
        </Alert>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-6"
          >
            <CourseSelectionSection form={form} />

            {sameInstitutionSelected && (
              <p className="text-sm text-red-600">
                New institution must differ from the current institution.
              </p>
            )}

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Transfer Reason <span className="text-red-500">*</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="e.g. Learner requested change from Pharmacy to Physiotherapy due to…"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirm"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3">
                  <FormControl>
                    <Checkbox
                      checked={field.value === true}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>
                      I understand a new Application ID will be generated and
                      the old one cannot be recovered.
                    </FormLabel>
                    <FormMessage />
                  </div>
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={transfer.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={transfer.isPending || sameInstitutionSelected}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {transfer.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Transfer & Regenerate ID
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
