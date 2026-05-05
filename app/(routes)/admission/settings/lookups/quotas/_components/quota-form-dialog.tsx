'use client';

// quota-form-dialog.tsx
// Create/Edit dialog for the global `quotas` table.
// Uses react-hook-form + zod (project standard, see admission-year-form.tsx).

import { useEffect } from 'react';
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
import { Switch } from '@/components/ui/switch';

import { LookupService } from '@/lib/services/admission/lookup-service';
import type { AdmissionFeeQuota } from '@/types/admission';

const codeRegex = /^[a-z0-9_]+$/;

const quotaFormSchema = z.object({
  code: z
    .string()
    .min(2, 'Code must be at least 2 characters')
    .max(60, 'Code must be at most 60 characters')
    .regex(codeRegex, 'Code must be lowercase letters, digits, or underscores only'),
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(120, 'Name must be at most 120 characters'),
  sort_order: z
    .number({ invalid_type_error: 'Sort order must be a number' })
    .int()
    .min(0)
    .max(9999),
  is_active: z.boolean(),
});

type FormValues = z.infer<typeof quotaFormSchema>;

interface QuotaFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  initialValues: AdmissionFeeQuota | null;
  onSuccess?: () => void;
}

export function QuotaFormDialog({
  open,
  onOpenChange,
  mode,
  initialValues,
  onSuccess,
}: QuotaFormDialogProps) {
  const isEditing = mode === 'edit';

  const form = useForm<FormValues>({
    resolver: zodResolver(quotaFormSchema),
    defaultValues: {
      code: '',
      name: '',
      sort_order: 99,
      is_active: true,
    },
  });

  useEffect(() => {
    if (open) {
      if (initialValues) {
        form.reset({
          code: initialValues.code,
          name: initialValues.name,
          sort_order: initialValues.sort_order ?? 99,
          is_active: initialValues.is_active,
        });
      } else {
        form.reset({
          code: '',
          name: '',
          sort_order: 99,
          is_active: true,
        });
      }
    }
  }, [open, initialValues, form]);

  const handleSubmit = async (values: FormValues) => {
    try {
      if (isEditing && initialValues) {
        // Code is immutable in edit mode; don't pass it
        await LookupService.updateQuota(initialValues.id, {
          name: values.name,
          sort_order: values.sort_order,
          is_active: values.is_active,
        });
        toast.success(`Updated quota "${values.name}"`);
      } else {
        await LookupService.createQuota({
          code: values.code,
          name: values.name,
          sort_order: values.sort_order,
          is_active: values.is_active,
        });
        toast.success(`Created quota "${values.name}"`);
      }
      onSuccess?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save quota';
      toast.error(message);
    }
  };

  const isBusy = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Quota' : 'New Quota'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the quota details. The code cannot be changed.'
              : 'Add a new quota to the global catalogue.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. govt_quota"
                      {...field}
                      disabled={isBusy || isEditing}
                    />
                  </FormControl>
                  <FormDescription>
                    Lowercase letters, digits, and underscores only. Cannot be changed after creation.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Government Quota"
                      {...field}
                      disabled={isBusy}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sort_order"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sort Order</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                      disabled={isBusy}
                    />
                  </FormControl>
                  <FormDescription>
                    Lower numbers appear first in dropdowns.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-md border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Active</FormLabel>
                    <FormDescription>
                      Inactive quotas are hidden from active dropdowns.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={isBusy}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
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
                {isEditing ? 'Save Changes' : 'Create Quota'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
