'use client';

// Finding-type form dialog — create/edit for audit_finding_types.
//
// 4 system rows seeded at migration (gap / inconsistency / missing_evidence /
// data_quality) are protected by RLS's is_system=false WHERE clause. Admins
// can add new rows (e.g., "regulatory_change", "benchmarking") and edit their
// own institution-scoped rows.
//
// There is no AuditFindingTypeService yet — this dialog talks to the
// audit_finding_types table via supabase client directly. When a service gets
// extracted in a later sprint, this file becomes its first consumer.
//
// Adapter contract (for CrudRowActions.EditDialog): same as parameter dialog.

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { usePermissions } from '@/hooks/use-permissions';
import type { AuditFindingType } from '@/lib/types/audit';

const formSchema = z.object({
  code: z
    .string()
    .min(2, 'Code must be at least 2 characters')
    .max(40)
    .regex(
      /^[a-z0-9_]+$/,
      'Code must be lowercase letters, numbers, and underscores only'
    ),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  description: z.string().max(500).optional().nullable()
});

type FormValues = z.infer<typeof formSchema>;

interface FindingTypeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  entity?: AuditFindingType;
}

export const auditFindingTypeKey = ['audit', 'finding-types'] as const;

export function FindingTypeFormDialog({
  open,
  onOpenChange,
  mode,
  entity
}: FindingTypeFormDialogProps) {
  const queryClient = useQueryClient();
  const { userProfile } = usePermissions();
  const institutionId = userProfile?.institution_id ?? null;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code: '',
      name: '',
      description: ''
    }
  });

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && entity) {
      form.reset({
        code: entity.code,
        name: entity.name,
        description: entity.description ?? ''
      });
    } else {
      form.reset({ code: '', name: '', description: '' });
    }
  }, [open, mode, entity, form]);

  const isSubmitting = form.formState.isSubmitting;
  const supabase = createClientSupabaseClient();

  const onSubmit = async (values: FormValues) => {
    try {
      if (mode === 'edit' && entity) {
        if (entity.is_system) {
          toast.error('System finding types cannot be edited.');
          return;
        }
        const { error } = await (supabase as any)
          .from('audit_finding_types')
          .update({
            code: values.code,
            name: values.name,
            description: values.description || null
          })
          .eq('id', entity.id);
        if (error) throw error;
        toast.success('Finding type updated');
      } else {
        const { error } = await (supabase as any)
          .from('audit_finding_types')
          .insert({
            code: values.code,
            name: values.name,
            description: values.description || null,
            institution_id: institutionId,
            is_system: false,
            is_active: true
          });
        if (error) throw error;
        toast.success('Finding type created');
      }
      queryClient.invalidateQueries({ queryKey: auditFindingTypeKey });
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to save finding type'
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='w-[95vw] max-w-[480px]'>
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Create Finding Type' : 'Edit Finding Type'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Add a new finding classification (e.g., regulatory_change).'
              : 'Update the finding type. System types cannot be modified.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
            <FormField
              control={form.control}
              name='code'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='e.g., regulatory_change'
                      {...field}
                      onChange={(e) =>
                        field.onChange(e.target.value.toLowerCase())
                      }
                      disabled={mode === 'edit' && entity?.is_system}
                    />
                  </FormControl>
                  <FormDescription className='text-xs'>
                    Lowercase letters, numbers, underscores only.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='Display name'
                      {...field}
                      disabled={mode === 'edit' && entity?.is_system}
                    />
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
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      className='resize-none'
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      disabled={mode === 'edit' && entity?.is_system}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className='flex flex-col-reverse sm:flex-row justify-end gap-3 pt-2'>
              <Button
                type='button'
                variant='outline'
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type='submit'
                disabled={isSubmitting || (mode === 'edit' && entity?.is_system)}
              >
                {isSubmitting && <Loader2 className='h-4 w-4 mr-2 animate-spin' />}
                {mode === 'create' ? 'Create' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
