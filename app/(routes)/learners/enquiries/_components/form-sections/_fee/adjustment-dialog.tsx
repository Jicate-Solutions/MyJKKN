'use client';

// ============================================================================
// adjustment-dialog.tsx
// ----------------------------------------------------------------------------
// Plan 3 / Task 10 — Add/Edit a per-learner fee adjustment.
// Modeled on Plan 2's quota-form-dialog: react-hook-form + zod, with toast.
// ----------------------------------------------------------------------------
// Spec §6.3 + §9.2  · Plan: 2026-05-05-admission-fees-plan-03 Task 10
// ============================================================================

import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { Button } from '@/components/ui/button';
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { FeeAdjustmentService } from '@/lib/services/admission/fee-adjustment-service';
import type {
  AdmissionFeeAdjustment,
  AdmissionFeeAdjustmentReasonCode,
} from '@/types/admission';
import type { BillingCategory } from '@/types/billing';

const REASON_CODES: { value: AdmissionFeeAdjustmentReasonCode; label: string }[] = [
  { value: 'scholarship_merit', label: 'Scholarship — Merit' },
  { value: 'donor_seat', label: 'Donor Seat' },
  { value: 'sibling_rebate', label: 'Sibling Rebate' },
  { value: 'management_waiver', label: 'Management Waiver' },
  { value: 'fee_concession', label: 'Fee Concession' },
  { value: 'staff_ward', label: 'Staff Ward' },
  { value: 'financial_hardship', label: 'Financial Hardship' },
  { value: 'other', label: 'Other' },
];

const adjustmentSchema = z.object({
  reason_code: z.enum([
    'scholarship_merit',
    'donor_seat',
    'sibling_rebate',
    'management_waiver',
    'fee_concession',
    'staff_ward',
    'financial_hardship',
    'other',
  ]),
  delta_amount: z
    .number({ invalid_type_error: 'Delta must be a number' })
    .refine((v) => v !== 0, 'Delta must be non-zero (positive surcharge or negative discount)'),
  // empty string from the dropdown means "Global / no category"
  billing_category_id: z.string().optional().nullable(),
  reason_notes: z.string().optional().nullable(),
  // For v1 evidence is captured as one URL/string per line. File upload UX
  // deferred to v1.5.
  evidence_documents_text: z.string().optional().nullable(),
});

type FormValues = z.infer<typeof adjustmentSchema>;

interface AdjustmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  learnerId: string;
  initialValues: AdmissionFeeAdjustment | null;
  categories: BillingCategory[];
  onSuccess?: () => void;
}

const GLOBAL_VALUE = '__global__';

export function AdjustmentDialog({
  open,
  onOpenChange,
  mode,
  learnerId,
  initialValues,
  categories,
  onSuccess,
}: AdjustmentDialogProps) {
  const isEditing = mode === 'edit';

  const form = useForm<FormValues>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: {
      reason_code: 'scholarship_merit',
      delta_amount: 0,
      billing_category_id: null,
      reason_notes: '',
      evidence_documents_text: '',
    },
  });

  useEffect(() => {
    if (!open) return;
    if (initialValues) {
      const evidenceList = Array.isArray(initialValues.evidence_documents)
        ? (initialValues.evidence_documents as unknown[])
            .map((it) => (typeof it === 'string' ? it : JSON.stringify(it)))
            .join('\n')
        : '';
      form.reset({
        reason_code: initialValues.reason_code,
        delta_amount: Number(initialValues.delta_amount),
        billing_category_id: initialValues.billing_category_id,
        reason_notes: initialValues.reason_notes ?? '',
        evidence_documents_text: evidenceList,
      });
    } else {
      form.reset({
        reason_code: 'scholarship_merit',
        delta_amount: 0,
        billing_category_id: null,
        reason_notes: '',
        evidence_documents_text: '',
      });
    }
  }, [open, initialValues, form]);

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.category_name.localeCompare(b.category_name)),
    [categories],
  );

  const handleSubmit = async (values: FormValues) => {
    try {
      const evidence_documents = (values.evidence_documents_text ?? '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      const billing_category_id = values.billing_category_id || null;

      if (isEditing && initialValues) {
        await FeeAdjustmentService.update(initialValues.id, {
          reason_code: values.reason_code,
          delta_amount: values.delta_amount,
          reason_notes: values.reason_notes ?? null,
          evidence_documents,
        });
        toast.success('Adjustment updated');
      } else {
        await FeeAdjustmentService.create({
          learner_id: learnerId,
          reason_code: values.reason_code,
          delta_amount: values.delta_amount,
          billing_category_id,
          reason_notes: values.reason_notes ?? null,
          evidence_documents,
        });
        toast.success('Adjustment added');
      }
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save adjustment';
      toast.error(message);
    }
  };

  const isBusy = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex flex-col gap-0 p-0 sm:max-w-[520px]"
        style={{ maxHeight: 'min(90vh, 720px)' }}
      >
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>{isEditing ? 'Edit Adjustment' : 'Add Adjustment'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the adjustment. Resolved fee items will recalculate on save.'
              : 'Add a per-learner fee adjustment (scholarship, rebate, surcharge, etc.).'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <FormField
              control={form.control}
              name="reason_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason *</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={isBusy}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select reason" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {REASON_CODES.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="delta_amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Delta Amount (₹) *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="e.g. -5000 for discount, +1000 for surcharge"
                      value={field.value === undefined || field.value === null ? '' : field.value}
                      onChange={(e) =>
                        field.onChange(e.target.value === '' ? 0 : Number(e.target.value))
                      }
                      disabled={isBusy}
                    />
                  </FormControl>
                  <FormDescription>
                    Negative = discount, positive = surcharge. Cannot be zero.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="billing_category_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Billing Category</FormLabel>
                  <Select
                    onValueChange={(v) =>
                      field.onChange(v === GLOBAL_VALUE ? null : v)
                    }
                    value={field.value ?? GLOBAL_VALUE}
                    disabled={isBusy || isEditing}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Global (no category)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={GLOBAL_VALUE}>Global (no category)</SelectItem>
                      {sortedCategories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.category_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Pick a category to adjust that line item only. Leave as Global to apply
                    a flat delta to the resolved total.
                    {isEditing ? ' Category cannot be changed after creation.' : ''}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reason_notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Optional details — approval reference, scheme name, etc."
                      rows={3}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      disabled={isBusy}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="evidence_documents_text"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Evidence Documents</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={'One URL per line, e.g.\nhttps://docs.example.com/scholarship.pdf'}
                      rows={3}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      disabled={isBusy}
                    />
                  </FormControl>
                  <FormDescription>
                    Optional. Paste document URLs, one per line. File upload UI is planned for a future release.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            </div>

            <DialogFooter className="shrink-0 border-t bg-muted/30 px-6 py-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isBusy}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isBusy}>
                {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? 'Save Changes' : 'Add Adjustment'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
