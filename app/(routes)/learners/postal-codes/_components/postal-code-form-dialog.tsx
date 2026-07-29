'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';

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
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from '@/components/ui/searchable-select';

import { useCreatePostalCode, useUpdatePostalCode } from '@/hooks/use-postal-codes';
import { getDistrictsByState } from '@/lib/data/locations';
import { getErrorMessage } from '@/lib/utils';
import type { PostalCode, CreatePostalCodeInput } from '@/types/postal-code';

const TN_DISTRICTS = getDistrictsByState('tamil_nadu');
const DISTRICT_OPTIONS = TN_DISTRICTS.map((d) => ({ value: d.id, label: d.name }));

const formSchema = z.object({
  pincode: z.string().regex(/^[0-9]{6}$/, 'Pincode must be exactly 6 digits'),
  office_name: z.string().min(2, 'Office name must be at least 2 characters'),
  division: z.string().optional(),
  district_id: z.string().min(1, 'District is required'),
  latitude: z
    .string()
    .optional()
    .refine(
      (v) => !v || (!isNaN(Number(v)) && Number(v) >= 5 && Number(v) <= 15),
      'Outside Tamil Nadu range',
    ),
  longitude: z
    .string()
    .optional()
    .refine(
      (v) => !v || (!isNaN(Number(v)) && Number(v) >= 75 && Number(v) <= 82),
      'Outside Tamil Nadu range',
    ),
  is_active: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

const DEFAULT_VALUES: FormValues = {
  pincode: '',
  office_name: '',
  division: '',
  district_id: '',
  latitude: '',
  longitude: '',
  is_active: true,
};

interface PostalCodeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  postalCode?: PostalCode;
  /** Called after a successful create/update (DataTable refetch hook). */
  onSuccess?: () => void;
}

export function PostalCodeFormDialog({
  open,
  onOpenChange,
  mode,
  postalCode,
  onSuccess,
}: PostalCodeFormDialogProps) {
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: DEFAULT_VALUES,
  });

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && postalCode) {
      const matched = TN_DISTRICTS.find(
        (d) => d.name.toLowerCase() === postalCode.district.toLowerCase(),
      );
      form.reset({
        pincode: postalCode.pincode,
        office_name: postalCode.office_name,
        division: postalCode.division ?? '',
        district_id: matched?.id ?? postalCode.district_id ?? '',
        latitude: postalCode.latitude != null ? String(postalCode.latitude) : '',
        longitude: postalCode.longitude != null ? String(postalCode.longitude) : '',
        is_active: postalCode.is_active,
      });
    } else {
      form.reset(DEFAULT_VALUES);
    }
  }, [open, mode, postalCode, form]);

  const createPostalCode = useCreatePostalCode();
  const updatePostalCode = useUpdatePostalCode();

  const onSubmit = async (data: FormValues) => {
    const district = TN_DISTRICTS.find((d) => d.id === data.district_id);
    if (!district) {
      toast.error('Invalid district selected');
      return;
    }

    setSubmitting(true);
    try {
      const payload: CreatePostalCodeInput = {
        pincode: data.pincode.trim(),
        office_name: data.office_name.trim(),
        division: data.division?.trim() || null,
        district: district.name,
        district_id: district.id,
        latitude: data.latitude ? Number(data.latitude) : null,
        longitude: data.longitude ? Number(data.longitude) : null,
        is_active: data.is_active,
      };

      if (mode === 'create') {
        await createPostalCode.mutateAsync(payload);
        toast.success('Postal code created');
      } else if (postalCode) {
        await updatePostalCode.mutateAsync({ id: postalCode.id, input: payload });
        toast.success('Postal code updated');
      }
      onSuccess?.();
      onOpenChange(false);
    } catch (e) {
      const code = (e as { code?: string } | null)?.code;
      if (code === '23505') {
        toast.error('This post office already exists for this pincode');
      } else {
        toast.error(getErrorMessage(e));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='w-[95vw] max-w-[480px] max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Add Postal Code' : 'Edit Postal Code'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Add a new post office to the pincode directory.'
              : 'Update the post office details.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='pincode'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pincode</FormLabel>
                    <FormControl>
                      <Input placeholder='e.g., 638183' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='division'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Division <span className='text-muted-foreground font-normal'>(Optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder='e.g., Salem' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name='office_name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Office Name</FormLabel>
                  <FormControl>
                    <Input placeholder='e.g., Mettur Dam S.O' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='district_id'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>District</FormLabel>
                  <FormControl>
                    <SearchableSelect
                      value={field.value}
                      onValueChange={field.onChange}
                      options={DISTRICT_OPTIONS}
                      placeholder='Select district'
                      searchPlaceholder='Search districts...'
                      modal
                      className='w-full'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='latitude'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Latitude <span className='text-muted-foreground font-normal'>(Optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input type='number' step='any' placeholder='e.g., 11.7900' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='longitude'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Longitude <span className='text-muted-foreground font-normal'>(Optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input type='number' step='any' placeholder='e.g., 77.8000' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
