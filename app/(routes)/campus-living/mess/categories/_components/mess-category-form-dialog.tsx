'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useMessCategories } from '@/hooks/campus-living/use-mess-categories';
import { toast } from 'react-hot-toast';
import type { MessCategory } from '@/types/mess-categories';
import { MESS_CATEGORY_TYPE_LABELS } from '@/types/mess-categories';

const formSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters'),
  description: z
    .string()
    .max(500, 'Description must be at most 500 characters')
    .optional()
    .or(z.literal('')),
  type: z.enum(['boys', 'girls', 'mixed'], {
    required_error: 'Please select a type',
  }),
  sort_order: z.coerce.number().int().min(0, 'Must be 0 or greater'),
  is_active: z.boolean(),
  upgrades_enabled: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

interface MessCategoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  category?: MessCategory;
}

export function MessCategoryFormDialog({
  open,
  onOpenChange,
  mode,
  category,
}: MessCategoryFormDialogProps) {
  const { createMessCategory, updateMessCategory } = useMessCategories();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      type: 'boys',
      sort_order: 0,
      is_active: true,
      upgrades_enabled: false,
    },
  });

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && category) {
      form.reset({
        name: category.name,
        description: category.description ?? '',
        type: category.type,
        sort_order: category.sort_order,
        is_active: category.is_active,
        upgrades_enabled: category.upgrades_enabled ?? false,
      });
    } else {
      form.reset({
        name: '',
        description: '',
        type: 'boys',
        sort_order: 0,
        is_active: true,
        upgrades_enabled: false,
      });
    }
  }, [open, mode, category, form]);

  const onSubmit = async (data: FormValues) => {
    try {
      setSubmitting(true);
      const payload = { ...data, description: data.description?.trim() || null };
      if (mode === 'create') {
        await createMessCategory(payload);
        toast.success('Mess category created');
      } else if (category) {
        await updateMessCategory(category.id, payload);
        toast.success('Mess category updated');
      }
      onOpenChange(false);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : 'Failed to save mess category';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='w-[95vw] max-w-[480px]'>
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Create Mess Category' : 'Edit Mess Category'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Add a new mess category.'
              : 'Update the mess category details.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category Name</FormLabel>
                  <FormControl>
                    <Input placeholder='e.g., Vegetarian' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='description'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Description{' '}
                    <span className='text-muted-foreground font-normal'>
                      (Optional)
                    </span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='Brief description of this mess category'
                      className='min-h-[80px] resize-none'
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='type'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder='Select type' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(MESS_CATEGORY_TYPE_LABELS).map(
                        ([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='sort_order'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sort Order</FormLabel>
                  <FormControl>
                    <Input type='number' min={0} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='upgrades_enabled'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3'>
                  <div className='space-y-0.5'>
                    <FormLabel className='text-sm'>Allow upgrades</FormLabel>
                    <p className='text-xs text-muted-foreground'>
                      When on, residents in this mess category can see and use mess upgrades on
                      My Hostel. Off hides the mess upgrade options.
                    </p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='is_active'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3'>
                  <div className='space-y-0.5'>
                    <FormLabel className='text-sm'>Active</FormLabel>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className='flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4'>
              <Button
                type='button'
                variant='outline'
                onClick={() => onOpenChange(false)}
                disabled={submitting}
                className='w-full sm:w-auto'
              >
                Cancel
              </Button>
              <Button
                type='submit'
                disabled={submitting}
                className='w-full sm:w-auto'
              >
                {submitting && <Loader2 className='h-4 w-4 mr-2 animate-spin' />}
                {mode === 'create' ? 'Create' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
