'use client';

/**
 * The constants a paying institution's Bank Letter and Chairperson Approval
 * print that the register cannot supply: the letter reference code, the
 * college's own bank / branch / account, and the signatory wording.
 *
 * Filled ONCE per institution and reused every month. On first open the form
 * is seeded with suggestions (ref code from the staff-code prefix, bank from
 * the staff accounts) — they are not saved until someone presses Save, and no
 * document is generated from an unsaved suggestion.
 *
 * Flex shell with its own scroll area: DialogContent sets no max-height here,
 * and this form is taller than a laptop viewport.
 */

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getErrorMessage } from '@/lib/utils';
import { useSavePayrollDocumentSettings } from '@/hooks/hr/payroll/use-salary-register';
import {
  payrollDocumentSettingsSchema,
  type PayrollDocumentSettingsFormValues,
} from '@/lib/validations/payroll-document-settings';
import type { HRPayrollDocumentSettings, PayrollDocumentSettingsInput } from '@/types/hr-payroll';

interface DocumentSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hrOrganizationId: string;
  organisationName: string;
  /** Saved values, or suggestions when nothing is saved yet. */
  settings: HRPayrollDocumentSettings | undefined;
  saved: boolean;
}

export function DocumentSettingsDialog(props: DocumentSettingsDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {/* Remount per open so the form re-seeds from the latest settings. */}
      {props.open && props.settings && <SettingsForm {...props} settings={props.settings} />}
    </Dialog>
  );
}

const FIELDS: {
  name: keyof PayrollDocumentSettingsFormValues;
  label: string;
  description?: string;
  placeholder?: string;
}[] = [
  { name: 'reference_code', label: 'Reference code', placeholder: 'JKKNCOP', description: 'Printed as "JKKNCOP/ AUGUST SALARY/ 2026".' },
  { name: 'non_teaching_suffix', label: 'Non-teaching suffix', placeholder: 'NT', description: 'Appended for non-teaching: JKKNCOP + NT = JKKNCOPNT.' },
  { name: 'bank_name', label: 'College bank', placeholder: 'Indian Bank', description: 'The bank the letter is addressed to and the cheque is drawn on.' },
  { name: 'bank_branch', label: 'Branch', placeholder: 'Kumarapalayam' },
  { name: 'college_account_number', label: 'College account number', placeholder: '1775', description: 'The account the cheque is drawn from — printed in the enclosure line.' },
  { name: 'addressee_title', label: 'Addressee', placeholder: 'The Manager' },
  { name: 'approval_salutation', label: 'Approval salutation', placeholder: 'Respected Madam' },
  { name: 'submitter_title', label: 'Submitted by (left signature)', placeholder: 'CAO' },
  { name: 'approver_title', label: 'Approved by (right signature)', placeholder: 'CHAIRPERSON' },
];

function SettingsForm({
  onOpenChange,
  hrOrganizationId,
  organisationName,
  settings,
  saved,
}: DocumentSettingsDialogProps & { settings: HRPayrollDocumentSettings }) {
  const save = useSavePayrollDocumentSettings(hrOrganizationId);

  const form = useForm<PayrollDocumentSettingsFormValues>({
    resolver: zodResolver(payrollDocumentSettingsSchema),
    defaultValues: {
      reference_code: settings.reference_code,
      non_teaching_suffix: settings.non_teaching_suffix,
      bank_name: settings.bank_name,
      bank_branch: settings.bank_branch,
      college_account_number: settings.college_account_number,
      addressee_title: settings.addressee_title,
      approval_salutation: settings.approval_salutation,
      submitter_title: settings.submitter_title,
      approver_title: settings.approver_title,
    },
  });

  const onSubmit = (values: PayrollDocumentSettingsFormValues) => {
    // Validated by the resolver; the cast only restores the required-ness that
    // z.infer drops while strictNullChecks is off in this repo.
    save.mutate(values as PayrollDocumentSettingsInput, {
      onSuccess: () => {
        toast.success('Document details saved.');
        onOpenChange(false);
      },
      onError: (err) => toast.error(getErrorMessage(err)),
    });
  };

  return (
    <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-lg">
      <DialogHeader className="shrink-0">
        <DialogTitle>College document details</DialogTitle>
        <DialogDescription>
          {organisationName} — printed on every Bank Letter and Chairperson Approval.
          {!saved && ' Suggested values are filled in; check them and save.'}
        </DialogDescription>
      </DialogHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 pb-2">
            {FIELDS.map((f) => (
              <FormField
                key={f.name}
                control={form.control}
                name={f.name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{f.label}</FormLabel>
                    <FormControl>
                      <Input placeholder={f.placeholder} {...field} />
                    </FormControl>
                    {f.description && <FormDescription>{f.description}</FormDescription>}
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save details'
              )}
            </Button>
          </div>
        </form>
      </Form>
    </DialogContent>
  );
}
