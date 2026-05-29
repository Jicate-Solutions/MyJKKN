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
  FormDescription,
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
import { useAdmissionPackages } from '@/hooks/campus-living/use-admission-packages';
import { useActiveHostelCategories } from '@/hooks/campus-living/use-hostel-categories';
import { useActiveHostelYears } from '@/hooks/campus-living/use-hostel-years';
import { toast } from 'react-hot-toast';
import type { AdmissionPackage } from '@/types/admission-packages';

const formSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(120),
  description: z.string().max(500).optional().or(z.literal('')),
  total_price_inr: z.coerce.number().int().min(0, 'Price must be 0 or greater'),
  room_category_id: z.string().uuid('Select a room category'),
  hostel_year_id: z.string().uuid().optional().or(z.literal('')),
  is_active: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

interface PackageFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  pkg?: AdmissionPackage;
  // Institution context — packages are per-institution. Falls back to the
  // pkg's institution on edit; on create the caller should pass it.
  institutionId?: string;
}

// A package's room is always a Classic-tier category (decision 13). We filter
// the dropdown to categories whose name contains "Classic". If none match
// (naming differs), we fall back to showing all so the admin isn't blocked.
function classicFilter<T extends { name: string }>(cats: T[]): T[] {
  const classic = cats.filter((c) => /classic/i.test(c.name));
  return classic.length > 0 ? classic : cats;
}

export function PackageFormDialog({
  open,
  onOpenChange,
  mode,
  pkg,
  institutionId,
}: PackageFormDialogProps) {
  const { createPackage, updatePackage } = useAdmissionPackages();
  const { hostelCategories } = useActiveHostelCategories();
  const { hostelYears } = useActiveHostelYears();
  const [submitting, setSubmitting] = useState(false);

  const roomCategories = classicFilter(hostelCategories ?? []);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      total_price_inr: 0,
      room_category_id: '',
      hostel_year_id: '',
      is_active: true,
    },
  });

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && pkg) {
      form.reset({
        name: pkg.name,
        description: pkg.description ?? '',
        total_price_inr: pkg.total_price_inr,
        room_category_id: pkg.room_category_id,
        hostel_year_id: pkg.hostel_year_id ?? '',
        is_active: pkg.is_active,
      });
    } else {
      form.reset({
        name: '',
        description: '',
        total_price_inr: 0,
        room_category_id: '',
        hostel_year_id: '',
        is_active: true,
      });
    }
  }, [open, mode, pkg, form]);

  const onSubmit = async (data: FormValues) => {
    const inst = institutionId ?? pkg?.institution_id;
    if (!inst) {
      toast.error('No institution context — cannot save package');
      return;
    }
    try {
      setSubmitting(true);
      const payload = {
        name: data.name,
        description: data.description?.trim() || null,
        total_price_inr: data.total_price_inr,
        room_category_id: data.room_category_id,
        hostel_year_id: data.hostel_year_id || null,
        is_active: data.is_active,
      };
      if (mode === 'create') {
        await createPackage({ institution_id: inst, ...payload });
        toast.success('Package created');
      } else if (pkg) {
        await updatePackage(pkg.id, payload);
        toast.success('Package updated');
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save package');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='w-[95vw] max-w-[520px]'>
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Create Package' : 'Edit Package'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Define a package: a Classic room bundled for a single flat price.'
              : 'Update the package details.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Package Name</FormLabel>
                  <FormControl>
                    <Input placeholder='e.g., Standard Residential Package' {...field} />
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
                    <span className='text-muted-foreground font-normal'>(Optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='What this package includes'
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
              name='total_price_inr'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Total Price (₹ / hostel year)</FormLabel>
                  <FormControl>
                    <Input type='number' min={0} {...field} />
                  </FormControl>
                  <FormDescription>
                    Single flat price shown to the learner; component prices are hidden.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='room_category_id'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bundled Room Category (Classic)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder='Select a Classic room category' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {roomCategories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Premium is never bundled — it is always an opt-in upgrade.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='hostel_year_id'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Hostel Year{' '}
                    <span className='text-muted-foreground font-normal'>(Optional)</span>
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder='Select a hostel year' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(hostelYears ?? []).map((y) => (
                        <SelectItem key={y.id} value={y.id}>
                          {y.name}
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
