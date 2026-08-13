'use client';

// scheme-form-dialog.tsx
//
// Create or edit a named concession scheme — Staff Ward −50% tuition,
// Sibling −10%, RTE −100% of everything, Merit −₹5,000.
//
// A scheme names WHAT the discount is; assigning it to learners is separate.
// That split is what makes "how many staff wards do we have, and what do they
// cost us?" answerable — an ad-hoc per-learner amount turns that into
// text-matching a reason field.

import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useSchoolFeeHeads } from '@/hooks/school-fees/use-school-fee-heads';
import {
  createSchoolFeeConcessionSchemeSchema,
  type SchoolFeeConcessionSchemeFormValues,
} from '@/lib/services/school-fees/school-fees-schemas';
import type { SchoolFeeConcessionScheme } from '@/types/school-fees';

interface SchemeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institutionId: string;
  scheme?: SchoolFeeConcessionScheme | null;
  saving: boolean;
  onSubmit: (values: SchoolFeeConcessionSchemeFormValues) => Promise<unknown>;
}

function defaults(
  institutionId: string,
  scheme?: SchoolFeeConcessionScheme | null,
): SchoolFeeConcessionSchemeFormValues {
  return {
    institution_id: institutionId,
    code: scheme?.code ?? '',
    name: scheme?.name ?? '',
    mode: scheme?.mode ?? 'percent',
    value: scheme ? Number(scheme.value) : 0,
    applies_to_all_heads: scheme?.applies_to_all_heads ?? false,
    is_active: scheme?.is_active ?? true,
    notes: scheme?.notes ?? '',
    head_ids: scheme?.head_ids ?? [],
  };
}

export function SchemeFormDialog({
  open,
  onOpenChange,
  institutionId,
  scheme,
  saving,
  onSubmit,
}: SchemeFormDialogProps) {
  const { heads } = useSchoolFeeHeads();

  const form = useForm<SchoolFeeConcessionSchemeFormValues>({
    resolver: zodResolver(createSchoolFeeConcessionSchemeSchema),
    defaultValues: defaults(institutionId, scheme),
  });

  // Re-seed when the dialog reopens for a different scheme. defaultValues is
  // read once on mount, so without this an edit would show the previous
  // scheme's values.
  useEffect(() => {
    if (open) form.reset(defaults(institutionId, scheme));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scheme, institutionId]);

  const mode = form.watch('mode');
  const allHeads = form.watch('applies_to_all_heads');
  const selectedHeads = form.watch('head_ids') ?? [];

  const valueHint = useMemo(
    () =>
      mode === 'percent'
        ? 'Percentage off the selected heads. Multiple percent schemes on one learner are summed and capped at 100%.'
        : 'Flat rupee amount, spread across the head’s terms in proportion to what each term carries.',
    [mode],
  );

  const submit = form.handleSubmit(async (values) => {
    await onSubmit(values);
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{scheme ? 'Edit concession scheme' : 'New concession scheme'}</DialogTitle>
          <DialogDescription>
            Define the discount once, then assign it to learners for a specific academic year.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="STAFF_WARD"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                      />
                    </FormControl>
                    <FormDescription>Uppercase letters, numbers and underscores.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Staff Ward" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="mode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="percent">Percentage (%)</SelectItem>
                        <SelectItem value="flat">Flat amount (₹)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{mode === 'percent' ? 'Percentage' : 'Amount (₹)'}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={mode === 'percent' ? 100 : undefined}
                        step="0.01"
                        value={field.value ?? 0}
                        onChange={(e) =>
                          field.onChange(e.target.value === '' ? 0 : Number(e.target.value))
                        }
                      />
                    </FormControl>
                    <FormDescription>{valueHint}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="applies_to_all_heads"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border p-3">
                  <div className="space-y-0.5 pr-4">
                    <FormLabel>Applies to every fee head</FormLabel>
                    <FormDescription>
                      Use for RTE-style full waivers. Covers heads added to a plan later, too.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            {!allHeads ? (
              <FormField
                control={form.control}
                name="head_ids"
                render={() => (
                  <FormItem>
                    <FormLabel>Fee heads covered</FormLabel>
                    <div className="rounded-md border divide-y">
                      {heads.map((head) => {
                        const checked = selectedHeads.includes(head.id);
                        return (
                          <label
                            key={head.id}
                            className="flex items-center gap-3 p-2.5 cursor-pointer"
                            htmlFor={`head-${head.id}`}
                          >
                            <Checkbox
                              id={`head-${head.id}`}
                              checked={checked}
                              onCheckedChange={(next) =>
                                form.setValue(
                                  'head_ids',
                                  next
                                    ? [...selectedHeads, head.id]
                                    : selectedHeads.filter((id) => id !== head.id),
                                  { shouldValidate: true },
                                )
                              }
                            />
                            <span className="text-sm">{head.category_name}</span>
                          </label>
                        );
                      })}
                      {heads.length === 0 ? (
                        <p className="p-3 text-sm text-muted-foreground">
                          No school fee heads found.
                        </p>
                      ) : null}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center gap-3">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <Label className="!mt-0">Active</Label>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : scheme ? 'Save changes' : 'Create scheme'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
