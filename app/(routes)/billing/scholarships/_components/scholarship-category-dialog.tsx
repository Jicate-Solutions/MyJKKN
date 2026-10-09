'use client';

import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  useCreateScholarshipCategory,
  useUpdateScholarshipCategory
} from '@/hooks/billing/use-scholarship-setup';
import type { ScholarshipCategory } from '@/types/billing-schedule';

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120, 'Keep it under 120 characters'),
  description: z.string().trim().max(500, 'Keep it under 500 characters'),
  sort_order: z
    .string()
    .trim()
    .refine((v) => v === '' || /^-?\d+$/.test(v), 'Enter a whole number'),
  is_active: z.boolean()
});
type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create. */
  category: ScholarshipCategory | null;
  /** Pre-filled sort order for a new category (last + 10). */
  nextSortOrder: number;
}

export function ScholarshipCategoryDialog({
  open,
  onOpenChange,
  category,
  nextSortOrder
}: Props) {
  const create = useCreateScholarshipCategory();
  const update = useUpdateScholarshipCategory();
  const isPending = create.isPending || update.isPending;

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '', sort_order: '', is_active: true }
  });

  useEffect(() => {
    if (!open) return;
    reset({
      name: category?.name ?? '',
      description: category?.description ?? '',
      sort_order: String(category?.sort_order ?? nextSortOrder),
      is_active: category?.is_active ?? true
    });
  }, [open, category, nextSortOrder, reset]);

  const onSubmit = async (values: FormValues) => {
    const payload = {
      name: values.name,
      description: values.description || null,
      sort_order: values.sort_order === '' ? 0 : Number(values.sort_order),
      is_active: values.is_active
    };
    try {
      if (category) {
        await update.mutateAsync({ id: category.id, data: payload });
      } else {
        await create.mutateAsync(payload);
      }
      onOpenChange(false);
    } catch {
      // The mutation hook already toasted the message; keep the dialog open.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[85vh] overflow-y-auto sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>
            {category ? 'Edit scholarship category' : 'New scholarship category'}
          </DialogTitle>
          <DialogDescription>
            Categories group the scholarship types offered on the Apply
            Scholarship form.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='category-name'>Name *</Label>
            <Input id='category-name' {...register('name')} autoFocus />
            {errors.name && (
              <p className='text-xs text-destructive'>{errors.name.message}</p>
            )}
          </div>

          <div className='space-y-2'>
            <Label htmlFor='category-description'>Description</Label>
            <Textarea id='category-description' rows={2} {...register('description')} />
            {errors.description && (
              <p className='text-xs text-destructive'>{errors.description.message}</p>
            )}
          </div>

          <div className='grid grid-cols-2 gap-4'>
            <div className='space-y-2'>
              <Label htmlFor='category-sort'>Sort order</Label>
              <Input id='category-sort' inputMode='numeric' {...register('sort_order')} />
              {errors.sort_order && (
                <p className='text-xs text-destructive'>{errors.sort_order.message}</p>
              )}
            </div>
            <div className='flex items-end gap-2 pb-2'>
              <Controller
                control={control}
                name='is_active'
                render={({ field }) => (
                  <Switch
                    id='category-active'
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
              <Label htmlFor='category-active'>Active</Label>
            </div>
          </div>

          <DialogFooter>
            <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type='submit' disabled={isPending}>
              {isPending ? 'Saving…' : category ? 'Save changes' : 'Create category'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
