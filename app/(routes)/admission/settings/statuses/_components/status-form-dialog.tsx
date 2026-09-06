'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { admissionStatusFormSchema, THRESHOLD_BASIS_LABELS, type AdmissionStatusFormInput, type AdmissionStatus, type AdmissionStatusScope, type ThresholdBasis } from '@/types/admission-status';
import { useCreateAdmissionStatus, useUpdateAdmissionStatus } from '@/hooks/admission/use-admission-statuses';

interface Props {
  scope: AdmissionStatusScope;
  initial?: AdmissionStatus;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function StatusFormDialog({ scope, initial, open, onOpenChange }: Props) {
  const isEdit = !!initial;
  const create = useCreateAdmissionStatus();
  const update = useUpdateAdmissionStatus();

  const form = useForm<AdmissionStatusFormInput>({
    resolver: zodResolver(admissionStatusFormSchema),
    defaultValues: initial ?? {
      scope,
      code: '',
      label: '',
      description: '',
      color: '#22C55E',
      icon: null,
      sort_order: 100,
      is_active: true,
      is_terminal: false,
      is_seat_filled: false,
      fee_paid_threshold_percent: scope === 'learner' ? null : null,
      threshold_basis: 'due_to_date',
      gates_login: false,
    },
  });

  const onSubmit = async (values: AdmissionStatusFormInput) => {
    // Guard against double-submit (feedback_react_query_disabled_prop_alone_isnt_enough.md)
    if (create.isPending || update.isPending) return;
    if (isEdit) {
      await update.mutateAsync({ id: initial!.id, patch: values });
    } else {
      await create.mutateAsync(values);
    }
    onOpenChange(false);
  };

  const isLearner = scope === 'learner';
  const pending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          w-[calc(100vw-2rem)] sm:w-full sm:max-w-xl
          max-h-[90vh] sm:max-h-[85vh]
          p-0
          flex flex-col
          gap-0
        "
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle>
            {scope === 'lead'
              ? (isEdit ? 'Edit Stage' : 'Add Stage')
              : (isEdit ? 'Edit Status' : 'Add Status')
            } — {scope === 'lead' ? 'Lead' : 'Learner'}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col flex-1 min-h-0"
          >
            {/* Scrollable body — caps growth so the footer never gets pushed off-screen */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-[300px]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField name="label" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FormLabel>Label</FormLabel>
                    <FormControl><Input {...field} placeholder="e.g. Active" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField name="code" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl><Input {...field} placeholder="active" disabled={isEdit} /></FormControl>
                    <FormDescription>Lowercase, underscores. Cannot change after creation.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField name="description" control={form.control} render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl><Textarea {...field} value={field.value ?? ''} rows={2} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <FormField name="color" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color</FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-2">
                        <Input
                          type="color"
                          value={field.value}
                          onChange={field.onChange}
                          className="h-9 w-12 shrink-0 p-1"
                          aria-label="Pick color"
                        />
                        <Input
                          value={field.value}
                          onChange={field.onChange}
                          className="font-mono"
                          aria-label="Hex color value"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField name="sort_order" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FormLabel>Order</FormLabel>
                    <FormControl><Input type="number" inputMode="numeric" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField name="icon" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FormLabel>Icon (optional)</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ''} placeholder="lucide name" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField name="is_terminal" control={form.control} render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-3 rounded border p-3">
                    <div className="min-w-0">
                      <FormLabel>Terminal</FormLabel>
                      <FormDescription>End state; no further transitions.</FormDescription>
                    </div>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )} />
                <FormField name="is_active" control={form.control} render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-3 rounded border p-3">
                    <div className="min-w-0">
                      <FormLabel>Active</FormLabel>
                      <FormDescription>Visible in dropdowns and filters.</FormDescription>
                    </div>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )} />
              </div>

              {isLearner && (
                <div className="space-y-3 rounded border border-dashed p-3">
                  <p className="text-sm font-medium">Learner-only options</p>
                  <FormField name="is_seat_filled" control={form.control} render={({ field }) => (
                    <FormItem className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <FormLabel>Counts as Seat Filled</FormLabel>
                        <FormDescription>Only ONE learner status can carry this flag.</FormDescription>
                      </div>
                      <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField name="gates_login" control={form.control} render={({ field }) => (
                    <FormItem className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <FormLabel>Enables Login</FormLabel>
                        <FormDescription>Learner can sign in only when in a status with this flag.</FormDescription>
                      </div>
                      <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField name="fee_paid_threshold_percent" control={form.control} render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fee-paid threshold (%)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min={0}
                          max={100}
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                        />
                      </FormControl>
                      <FormDescription>
                        A learner&apos;s paid-% (excluding application_fee bills) must meet this to enter the status.
                        Leave blank for no gate.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField name="threshold_basis" control={form.control} render={({ field }) => (
                    <FormItem>
                      <FormLabel>Threshold counts…</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Bills due as on date" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(Object.keys(THRESHOLD_BASIS_LABELS) as ThresholdBasis[]).map((k) => (
                            <SelectItem key={k} value={k}>{THRESHOLD_BASIS_LABELS[k]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        What the paid-% is measured against. &quot;Bills due as on date&quot; is the default:
                        a learner is never behind on money whose due date has not arrived. The legacy
                        &quot;All bills to date&quot; pools every year&apos;s bills the moment they are raised.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              )}
            </div>

            {/* Pinned footer — full-width-stacked on mobile, right-aligned on sm+ */}
            <DialogFooter className="
              px-6 py-4 border-t
              flex flex-col-reverse sm:flex-row sm:justify-end gap-2
            ">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={pending}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={pending}
                className="w-full sm:w-auto"
              >
                {isEdit ? 'Save' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
