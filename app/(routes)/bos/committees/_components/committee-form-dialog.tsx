'use client';

// app/(routes)/bos/committees/_components/committee-form-dialog.tsx
// Create / edit dialog for an institution-wise BoS committee.
//
// Fields: Institution (super-admin picker, auto-filled for everyone else),
// Committee Name, Short Code (optional), Status (active switch).

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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from '@/components/ui/searchable-select';

import { BosCommittee } from '@/types/bos';
import {
  useCreateBosCommittee,
  useUpdateBosCommittee,
} from '@/hooks/bos/use-bos-committees';
import { logger } from '@/lib/utils/enhanced-logger';

const committeeFormSchema = z.object({
  institutions_id: z.string().min(1, 'Institution is required'),
  name: z.string().min(1, 'Committee name is required').max(255),
  short_code: z.string().max(50).optional(),
  sort_order: z.coerce.number().int().min(0, 'Order must be 0 or more'),
  is_active: z.boolean(),
});

type CommitteeFormValues = z.infer<typeof committeeFormSchema>;

interface InstitutionOption {
  id: string;
  name: string;
}

interface CommitteeFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful create/update — the DataTable uses it to refetch. */
  onSaved?: () => void;
  /** Row being edited; undefined = create mode. */
  committee?: BosCommittee;
  /** Institution choices for super-admins. */
  institutions: InstitutionOption[];
  isSuperAdmin: boolean;
  /** Auto-filled institution for non-super-admins (own institution). */
  defaultInstitutionsId?: string;
  /**
   * When set, the committee is owned by this composition (20260706). The
   * institution picker is suppressed (institution is inherited from the
   * composition via defaultInstitutionsId) and composition_id is sent on save.
   */
  compositionId?: string;
}

export function CommitteeFormDialog({
  open,
  onClose,
  onSaved,
  committee,
  institutions,
  isSuperAdmin,
  defaultInstitutionsId,
  compositionId,
}: CommitteeFormDialogProps) {
  // Inside a composition the institution is inherited, never chosen — hide the
  // picker even for super-admins.
  const showInstitutionPicker = isSuperAdmin && !compositionId;
  const createCommittee = useCreateBosCommittee();
  const updateCommittee = useUpdateBosCommittee();
  const isSubmitting = createCommittee.isPending || updateCommittee.isPending;

  const form = useForm<CommitteeFormValues>({
    resolver: zodResolver(committeeFormSchema),
    defaultValues: {
      institutions_id: '',
      name: '',
      short_code: '',
      sort_order: 0,
      is_active: true,
    },
  });

  // Re-seed whenever the dialog opens for a different row (or mode).
  useEffect(() => {
    if (!open) return;
    form.reset({
      institutions_id: committee?.institutions_id ?? defaultInstitutionsId ?? '',
      name: committee?.name ?? '',
      short_code: committee?.short_code ?? '',
      sort_order: committee?.sort_order ?? 0,
      is_active: committee?.is_active ?? true,
    });
  }, [open, committee, defaultInstitutionsId, form]);

  const handleSubmit = async (values: CommitteeFormValues) => {
    const payload = {
      institutions_id: values.institutions_id,
      // Only sent on create; a composition-owned committee never moves
      // compositions. Editing keeps its existing composition_id server-side.
      ...(compositionId && !committee ? { composition_id: compositionId } : {}),
      name: values.name.trim(),
      short_code: values.short_code?.trim() || null,
      sort_order: values.sort_order,
      is_active: values.is_active,
    };
    try {
      if (committee) {
        await updateCommittee.mutateAsync({ id: committee.id, data: payload });
        toast.success('Committee updated');
      } else {
        await createCommittee.mutateAsync(payload);
        toast.success('Committee created');
      }
      onSaved?.();
      onClose();
    } catch (err) {
      logger.error('academic/bos', 'Failed to save committee', err);
      toast.error((err as Error).message || 'Failed to save committee');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>{committee ? 'Edit Committee' : 'Add Committee'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className='space-y-4'>
            {showInstitutionPicker ? (
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
                    Name of the Committee <span className='text-destructive'>*</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder='e.g. Academic Committee' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className='grid grid-cols-2 gap-3'>
              <FormField
                control={form.control}
                name='short_code'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Short Code</FormLabel>
                    <FormControl>
                      <Input placeholder='e.g. AC (optional)' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='sort_order'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Committee Order</FormLabel>
                    <FormControl>
                      <Input type='number' min={0} {...field} />
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
                <FormItem className='flex items-center justify-between rounded-md border px-3 py-2'>
                  <FormLabel className='font-normal'>Active</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type='button' variant='outline' onClick={onClose}>
                Cancel
              </Button>
              <Button type='submit' disabled={isSubmitting}>
                {isSubmitting
                  ? 'Saving…'
                  : committee
                    ? 'Save Changes'
                    : 'Create Committee'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
