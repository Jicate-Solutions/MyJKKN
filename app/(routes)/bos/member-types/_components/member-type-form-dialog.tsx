'use client';

// app/(routes)/bos/member-types/_components/member-type-form-dialog.tsx
// Create / edit dialog for an institution-wise BoS member type.
//
// Fields: Institution (super-admin picker, auto-filled for everyone else),
// Name, Behaves As (legacy base_type — drives chairman rights and the
// staff-vs-expert picker in Add Member), Order, Status (active switch).

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'react-hot-toast';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from '@/components/ui/searchable-select';

import {
  BosMemberType,
  BosMemberTypeRecord,
  BOS_MEMBER_TYPE_LABELS,
} from '@/types/bos';
import {
  useCreateBosMemberType,
  useUpdateBosMemberType,
} from '@/hooks/bos/use-bos-member-types';
import { logger } from '@/lib/utils/enhanced-logger';

const BASE_TYPE_VALUES = Object.keys(BOS_MEMBER_TYPE_LABELS) as [
  BosMemberType,
  ...BosMemberType[],
];

const memberTypeFormSchema = z.object({
  institutions_id: z.string().min(1, 'Institution is required'),
  name: z.string().min(1, 'Member type name is required').max(255),
  base_type: z.enum(BASE_TYPE_VALUES),
  sort_order: z.coerce.number().int().min(0, 'Order must be 0 or more'),
  is_active: z.boolean(),
});

type MemberTypeFormValues = z.infer<typeof memberTypeFormSchema>;

interface InstitutionOption {
  id: string;
  name: string;
}

interface MemberTypeFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful create/update — the DataTable uses it to refetch. */
  onSaved?: () => void;
  /** Row being edited; undefined = create mode. */
  memberType?: BosMemberTypeRecord;
  /** Institution choices for super-admins. */
  institutions: InstitutionOption[];
  isSuperAdmin: boolean;
  /** Auto-filled institution for non-super-admins (own institution). */
  defaultInstitutionsId?: string;
}

export function MemberTypeFormDialog({
  open,
  onClose,
  onSaved,
  memberType,
  institutions,
  isSuperAdmin,
  defaultInstitutionsId,
}: MemberTypeFormDialogProps) {
  const createMemberType = useCreateBosMemberType();
  const updateMemberType = useUpdateBosMemberType();
  const isSubmitting = createMemberType.isPending || updateMemberType.isPending;

  const form = useForm<MemberTypeFormValues>({
    resolver: zodResolver(memberTypeFormSchema),
    defaultValues: {
      institutions_id: '',
      name: '',
      base_type: 'internal_member',
      sort_order: 0,
      is_active: true,
    },
  });

  // Re-seed whenever the dialog opens for a different row (or mode).
  useEffect(() => {
    if (!open) return;
    form.reset({
      institutions_id: memberType?.institutions_id ?? defaultInstitutionsId ?? '',
      name: memberType?.name ?? '',
      base_type: memberType?.base_type ?? 'internal_member',
      sort_order: memberType?.sort_order ?? 0,
      is_active: memberType?.is_active ?? true,
    });
  }, [open, memberType, defaultInstitutionsId, form]);

  const handleSubmit = async (values: MemberTypeFormValues) => {
    const payload = {
      institutions_id: values.institutions_id,
      name: values.name.trim(),
      base_type: values.base_type,
      sort_order: values.sort_order,
      is_active: values.is_active,
    };
    try {
      if (memberType) {
        await updateMemberType.mutateAsync({ id: memberType.id, data: payload });
        toast.success('Member type updated');
      } else {
        await createMemberType.mutateAsync(payload);
        toast.success('Member type created');
      }
      onSaved?.();
      onClose();
    } catch (err) {
      logger.error('academic/bos', 'Failed to save member type', err);
      toast.error((err as Error).message || 'Failed to save member type');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>{memberType ? 'Edit Member Type' : 'Add Member Type'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className='space-y-4'>
            {isSuperAdmin ? (
              <FormField
                control={form.control}
                name='institutions_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Institution <span className='text-destructive'>*</span>
                    </FormLabel>
                    <SearchableSelect
                      value={field.value}
                      onValueChange={field.onChange}
                      options={institutions.map((i) => ({ value: i.id, label: i.name }))}
                      placeholder='Select institution'
                      searchPlaceholder='Search institution…'
                      className='w-full'
                      modal
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <input type='hidden' {...form.register('institutions_id')} />
            )}

            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Name of the Member Type <span className='text-destructive'>*</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder='e.g. Convener' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='base_type'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Behaves As <span className='text-destructive'>*</span>
                  </FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {BASE_TYPE_VALUES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {BOS_MEMBER_TYPE_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription className='text-xs'>
                    Controls chairman rights, the staff/expert picker, and TA/DA
                    treatment for members of this type.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className='grid grid-cols-2 gap-3'>
              <FormField
                control={form.control}
                name='sort_order'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Order</FormLabel>
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
                  <FormItem className='flex items-center justify-between rounded-md border px-3 py-2 mt-auto'>
                    <FormLabel className='font-normal'>Active</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type='button' variant='outline' onClick={onClose}>
                Cancel
              </Button>
              <Button type='submit' disabled={isSubmitting}>
                {isSubmitting
                  ? 'Saving…'
                  : memberType
                    ? 'Save Changes'
                    : 'Create Member Type'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
