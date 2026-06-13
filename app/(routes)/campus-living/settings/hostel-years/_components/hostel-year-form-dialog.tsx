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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { useHostelYears } from '@/hooks/campus-living/use-hostel-years';
import { toast } from 'react-hot-toast';
import type { HostelYear } from '@/types/hostel-years';

const formSchema = z
  .object({
    name: z
      .string()
      .min(2, 'Name must be at least 2 characters')
      .max(100, 'Name must be at most 100 characters'),
    start_date: z.string().min(1, 'Start date is required'),
    end_date: z.string().min(1, 'End date is required'),
    description: z
      .string()
      .max(500, 'Description must be at most 500 characters')
      .optional()
      .or(z.literal('')),
    is_active: z.boolean(),
    is_current: z.boolean(),
  })
  .refine((d) => d.end_date > d.start_date, {
    message: 'End date must be after start date',
    path: ['end_date'],
  });

type FormValues = z.infer<typeof formSchema>;

interface HostelYearFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  hostelYear?: HostelYear;
}

const DEFAULTS: FormValues = {
  name: '',
  start_date: '',
  end_date: '',
  description: '',
  is_active: true,
  is_current: false,
};

export function HostelYearFormDialog({
  open,
  onOpenChange,
  mode,
  hostelYear,
}: HostelYearFormDialogProps) {
  const { createHostelYear, updateHostelYear } = useHostelYears();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: DEFAULTS,
  });

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && hostelYear) {
      form.reset({
        name: hostelYear.name,
        start_date: hostelYear.start_date,
        end_date: hostelYear.end_date,
        description: hostelYear.description ?? '',
        is_active: hostelYear.is_active,
        is_current: hostelYear.is_current,
      });
    } else {
      form.reset(DEFAULTS);
    }
  }, [open, mode, hostelYear, form]);

  const onSubmit = async (data: FormValues) => {
    try {
      setSubmitting(true);
      const payload = { ...data, description: data.description?.trim() || null };
      if (mode === 'create') {
        await createHostelYear(payload);
        toast.success('Hostel year created');
      } else if (hostelYear) {
        await updateHostelYear(hostelYear.id, payload);
        toast.success('Hostel year updated');
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save hostel year');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='w-[95vw] max-w-[520px]'>
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Create Hostel Year' : 'Edit Hostel Year'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Add a new hostel year (e.g., 2026–2027).'
              : 'Update the hostel year details.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Year Name</FormLabel>
                  <FormControl>
                    <Input placeholder='e.g., 2026–2027' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='start_date'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <FormControl>
                      <Input type='date' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='end_date'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date</FormLabel>
                    <FormControl>
                      <Input type='date' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name='description'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Description{' '}
                    <span className='text-muted-foreground font-normal'>(Optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='Notes about this hostel year'
                      className='min-h-[70px] resize-none'
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
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
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='is_current'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3'>
                  <div className='space-y-0.5'>
                    <FormLabel className='text-sm'>Current Year</FormLabel>
                    <FormDescription className='text-xs'>
                      Marked as the default year. Only one hostel year can be current.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
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
              <Button type='submit' disabled={submitting} className='w-full sm:w-auto'>
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
