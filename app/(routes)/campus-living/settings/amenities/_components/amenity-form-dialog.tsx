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
import { useAmenities } from '@/hooks/campus-living/use-amenities';
import { toast } from 'react-hot-toast';
import type { Amenity } from '@/types/amenities';

const CODE_REGEX = /^[a-z0-9_]+$/;

const formSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters'),
  code: z
    .string()
    .min(2, 'Code must be at least 2 characters')
    .max(64, 'Code must be at most 64 characters')
    .regex(CODE_REGEX, 'Code must be lowercase letters, numbers, underscores only'),
  description: z
    .string()
    .max(500, 'Description must be at most 500 characters')
    .optional()
    .or(z.literal('')),
  icon: z
    .string()
    .max(64, 'Icon name must be at most 64 characters')
    .optional()
    .or(z.literal('')),
  scope: z.enum(['block', 'room', 'both']),
  sort_order: z.coerce.number().int().min(0, 'Must be 0 or greater'),
  is_active: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

function deriveCode(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

interface AmenityFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  amenity?: Amenity;
}

export function AmenityFormDialog({
  open,
  onOpenChange,
  mode,
  amenity,
}: AmenityFormDialogProps) {
  const { createAmenity, updateAmenity } = useAmenities();
  const [submitting, setSubmitting] = useState(false);
  const [codeTouched, setCodeTouched] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      code: '',
      description: '',
      icon: '',
      scope: 'both',
      sort_order: 0,
      is_active: true,
    },
  });

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && amenity) {
      form.reset({
        name: amenity.name,
        code: amenity.code,
        description: amenity.description ?? '',
        icon: amenity.icon ?? '',
        scope: amenity.scope,
        sort_order: amenity.sort_order,
        is_active: amenity.is_active,
      });
      setCodeTouched(true);
    } else {
      form.reset({
        name: '',
        code: '',
        description: '',
        icon: '',
        scope: 'both',
        sort_order: 0,
        is_active: true,
      });
      setCodeTouched(false);
    }
  }, [open, mode, amenity, form]);

  // Auto-derive code from name on create until user manually edits code.
  const nameValue = form.watch('name');
  useEffect(() => {
    if (mode === 'create' && !codeTouched) {
      form.setValue('code', deriveCode(nameValue || ''), {
        shouldValidate: false,
      });
    }
  }, [nameValue, codeTouched, mode, form]);

  const onSubmit = async (data: FormValues) => {
    try {
      setSubmitting(true);
      if (mode === 'create') {
        await createAmenity({
          code: data.code,
          name: data.name,
          description: data.description?.trim() || null,
          icon: data.icon?.trim() || null,
          scope: data.scope,
          sort_order: data.sort_order,
          is_active: data.is_active,
        });
        toast.success('Amenity created');
      } else if (amenity) {
        await updateAmenity(amenity.id, {
          name: data.name,
          description: data.description?.trim() || null,
          icon: data.icon?.trim() || null,
          scope: data.scope,
          sort_order: data.sort_order,
          is_active: data.is_active,
        });
        toast.success('Amenity updated');
      }
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save amenity';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='w-[95vw] max-w-[480px] max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Create Amenity' : 'Edit Amenity'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Add a new informational amenity (Wi-Fi, Balcony, etc.).'
              : 'Update the amenity details.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder='e.g., Wi-Fi' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='code'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='e.g., wifi'
                      {...field}
                      readOnly={mode === 'edit'}
                      onChange={(e) => {
                        if (mode === 'create') setCodeTouched(true);
                        field.onChange(e);
                      }}
                    />
                  </FormControl>
                  <p className='text-xs text-muted-foreground'>
                    Lowercase letters, numbers, underscores only.
                    {mode === 'create' && ' Auto-filled from name; edit to override.'}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='scope'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Scope</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder='Select scope' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value='block'>Block</SelectItem>
                      <SelectItem value='room'>Room</SelectItem>
                      <SelectItem value='both'>Both</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className='text-xs text-muted-foreground'>
                    Where this amenity applies. Block-scoped amenities appear in
                    the block form, room-scoped in the room form, &ldquo;Both&rdquo; in both.
                  </p>
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
                      placeholder='Brief description of this amenity'
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
              name='icon'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Icon{' '}
                    <span className='text-muted-foreground font-normal'>
                      (Optional)
                    </span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder='e.g., Wifi' {...field} />
                  </FormControl>
                  <p className='text-xs text-muted-foreground'>
                    Lucide icon name e.g., Bath, Wifi, Wind
                  </p>
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
