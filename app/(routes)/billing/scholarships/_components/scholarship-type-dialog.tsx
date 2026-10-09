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
  useCreateScholarshipType,
  useUpdateScholarshipType
} from '@/hooks/billing/use-scholarship-setup';
import type { ScholarshipType } from '@/types/billing-schedule';

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
  categoryId: string;
  categoryName: string;
  /** null = create. */
  type: ScholarshipType | null;
  /** Pre-filled sort order for a new type (last + 10). */
  nextSortOrder: number;
}

export function ScholarshipTypeDialog({
  open,
  onOpenChange,
  categoryId,
  categoryName,
  type,
  nextSortOrder
}: Props) {
  const create = useCreateScholarshipType();
  const update = useUpdateScholarshipType();
  const isPending = create.isPending || update.isPending;

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      description: '',
      sort_order: '',
      is_active: true
    }
  });

  useEffect(() => {
    if (!open) return;
    reset({
      name: type?.name ?? '',
      description: type?.description ?? '',
      sort_order: String(type?.sort_order ?? nextSortOrder),
      is_active: type?.is_active ?? true
    });
  }, [open, type, nextSortOrder, reset]);

  const onSubmit = async (values: FormValues) => {
    const base = {
      name: values.name,
      description: values.description || null,
      sort_order: values.sort_order === '' ? 0 : Number(values.sort_order),
      is_active: values.is_active
    };
    try {
      if (type) {
        await update.mutateAsync({ id: type.id, data: base });
      } else {
        await create.mutateAsync({ category_id: categoryId, ...base });
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
          <DialogTitle>{type ? 'Edit scholarship type' : 'New scholarship type'}</DialogTitle>
          <DialogDescription>
            Under <span className='font-medium'>{categoryName}</span>. The value
            mode and value are chosen when the scholarship is applied.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='type-name'>Name *</Label>
            <Input id='type-name' {...register('name')} autoFocus />
            {errors.name && (
              <p className='text-xs text-destructive'>{errors.name.message}</p>
            )}
          </div>

          <div className='space-y-2'>
            <Label htmlFor='type-description'>Description</Label>
            <Textarea id='type-description' rows={2} {...register('description')} />
            {errors.description && (
              <p className='text-xs text-destructive'>{errors.description.message}</p>
            )}
          </div>

          <div className='grid grid-cols-2 gap-4'>
            <div className='space-y-2'>
              <Label htmlFor='type-sort'>Sort order</Label>
              <Input id='type-sort' inputMode='numeric' {...register('sort_order')} />
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
                    id='type-active'
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
              <Label htmlFor='type-active'>Active</Label>
            </div>
          </div>

          <DialogFooter>
            <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type='submit' disabled={isPending}>
              {isPending ? 'Saving…' : type ? 'Save changes' : 'Create type'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
