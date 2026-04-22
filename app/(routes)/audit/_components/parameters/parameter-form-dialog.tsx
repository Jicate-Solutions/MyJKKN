'use client';

// Parameter form dialog — create-override / edit-override for audit_parameter_catalog.
//
// What this does:
//   - Fields: code (readonly when editing), name, description, parameter_group,
//     framework_mapping (key-value row editor per body), default_owner_role,
//     escalation_role, p1_sla_days, p2_sla_days, evidence_required array.
//   - On submit, calls AuditParameterCatalogService.upsertOverride with the
//     user's institution_id so system rows (institution_id NULL) aren't
//     mutated — that's enforced by RLS + CHECK constraint on the service side.
//
// Adapter contract (for CrudRowActions.EditDialog):
//   { open, onOpenChange, mode: 'edit', entity: AuditParameterCatalogRow }
//
// Why it's safer than a raw insert: the service starts from the system row
// and merges the form values, so the institution override inherits defaults
// when the admin only changes one field (SLA, owner, etc.).

import { useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { AuditParameterCatalogService } from '@/lib/services/audit';
import { auditParameterKeys } from '@/hooks/audit/use-audit-parameters';
import { usePermissions } from '@/hooks/use-permissions';
import { EvidenceRequiredList } from './evidence-required-list';
import type {
  AuditParameterCatalogRow,
  EvidenceRequirementItem,
  ParameterGroup
} from '@/lib/types/audit';

const BODY_CODES = [
  'naac',
  'nba',
  'nirf',
  'ugc',
  'qs',
  'aicte',
  'ncte',
  'dci',
  'pci',
  'inc'
] as const;

const formSchema = z.object({
  code: z
    .string()
    .min(3, 'Code must be at least 3 characters')
    .max(80, 'Code must be at most 80 characters'),
  name: z.string().min(3, 'Name must be at least 3 characters').max(200),
  description: z.string().max(1000).optional().nullable(),
  parameter_group: z.coerce.number().int().min(1).max(4) as z.ZodType<ParameterGroup>,
  default_owner_role: z
    .string()
    .min(1, 'Default owner role is required')
    .max(50),
  escalation_role: z.string().max(50).optional().nullable(),
  p1_sla_days: z.coerce.number().int().min(1).max(365),
  p2_sla_days: z.coerce.number().int().min(1).max(365),
  framework_mapping_rows: z
    .array(
      z.object({
        body: z.string(),
        code: z.string()
      })
    )
    .default([])
});

type FormValues = z.infer<typeof formSchema>;

interface ParameterFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  entity?: AuditParameterCatalogRow;
}

export function ParameterFormDialog({
  open,
  onOpenChange,
  mode,
  entity
}: ParameterFormDialogProps) {
  const queryClient = useQueryClient();
  const { userProfile } = usePermissions();
  const institutionId = userProfile?.institution_id;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code: '',
      name: '',
      description: '',
      parameter_group: 1 as ParameterGroup,
      default_owner_role: '',
      escalation_role: '',
      p1_sla_days: 14,
      p2_sla_days: 30,
      framework_mapping_rows: []
    }
  });

  const { fields: mappingFields, append: appendMapping, remove: removeMapping } =
    useFieldArray({
      control: form.control,
      name: 'framework_mapping_rows'
    });

  // Evidence required is stored outside RHF state (it's a nested array shape
  // the EvidenceRequiredList already knows how to edit).
  const [evidenceRequired, setEvidenceRequired] = useState<
    EvidenceRequirementItem[]
  >([]);

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && entity) {
      form.reset({
        code: entity.code,
        name: entity.name,
        description: entity.description ?? '',
        parameter_group: entity.parameter_group,
        default_owner_role: entity.default_owner_role,
        escalation_role: entity.escalation_role ?? '',
        p1_sla_days: entity.p1_sla_days,
        p2_sla_days: entity.p2_sla_days,
        framework_mapping_rows: Object.entries(entity.framework_mapping ?? {}).map(
          ([body, code]) => ({ body, code: String(code ?? '') })
        )
      });
      setEvidenceRequired(entity.evidence_required ?? []);
    } else {
      form.reset({
        code: '',
        name: '',
        description: '',
        parameter_group: 1 as ParameterGroup,
        default_owner_role: '',
        escalation_role: '',
        p1_sla_days: 14,
        p2_sla_days: 30,
        framework_mapping_rows: []
      });
      setEvidenceRequired([]);
    }
  }, [open, mode, entity, form, setEvidenceRequired]);

  const isSubmitting = form.formState.isSubmitting;

  const onSubmit = async (values: FormValues) => {
    if (!institutionId) {
      toast.error('Cannot save: your user profile is missing an institution.');
      return;
    }
    if (!userProfile?.id) {
      toast.error('Cannot save: user session not loaded.');
      return;
    }

    const framework_mapping = values.framework_mapping_rows.reduce<
      Record<string, string>
    >((acc, row) => {
      if (row.body && row.code) acc[row.body] = row.code;
      return acc;
    }, {});

    try {
      await AuditParameterCatalogService.upsertOverride(
        values.code,
        institutionId,
        {
          name: values.name,
          description: values.description ?? null,
          framework_mapping,
          default_owner_role: values.default_owner_role,
          escalation_role: values.escalation_role || null,
          p1_sla_days: values.p1_sla_days,
          p2_sla_days: values.p2_sla_days,
          evidence_required: evidenceRequired
        },
        { userId: userProfile.id }
      );
      toast.success(
        mode === 'edit'
          ? 'Parameter override updated'
          : 'Parameter override created'
      );
      queryClient.invalidateQueries({ queryKey: auditParameterKeys.all });
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to save parameter override'
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='w-[95vw] max-w-[720px] max-h-[92vh] p-0'>
        <DialogHeader className='px-4 pt-4 sm:px-6 sm:pt-6'>
          <DialogTitle>
            {mode === 'create'
              ? 'Create Parameter Override'
              : `Edit Parameter — ${entity?.code ?? ''}`}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Create an institution-scoped override. System defaults remain protected.'
              : 'Changes apply to your institution only. System defaults are never modified.'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className='max-h-[calc(92vh-140px)] px-4 sm:px-6'>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className='space-y-4 pb-4'
            >
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                <FormField
                  control={form.control}
                  name='code'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Code</FormLabel>
                      <FormControl>
                        <Input
                          placeholder='e.g., G1-P02-obe-mapping'
                          {...field}
                          disabled={mode === 'edit'}
                        />
                      </FormControl>
                      <FormDescription className='text-xs'>
                        Stable identifier. Cannot change after create.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='parameter_group'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Parameter Group</FormLabel>
                      <Select
                        value={String(field.value)}
                        onValueChange={(v) => field.onChange(Number(v))}
                        disabled={mode === 'edit'}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value='1'>Group 1 — Academic</SelectItem>
                          <SelectItem value='2'>Group 2 — Research</SelectItem>
                          <SelectItem value='3'>Group 3 — Governance</SelectItem>
                          <SelectItem value='4'>Group 4 — Infrastructure</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder='Human-readable parameter name' {...field} />
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
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Framework mapping key-value editor */}
              <FormItem>
                <FormLabel>Framework Mapping</FormLabel>
                <FormDescription className='text-xs'>
                  Map this parameter to one or more accreditation bodies&apos;
                  criterion codes.
                </FormDescription>
                <div className='space-y-2 mt-2'>
                  {mappingFields.length === 0 && (
                    <p className='text-xs text-muted-foreground italic'>
                      No framework mappings yet.
                    </p>
                  )}
                  {mappingFields.map((fieldRow, index) => (
                    <div key={fieldRow.id} className='flex items-start gap-2'>
                      <FormField
                        control={form.control}
                        name={`framework_mapping_rows.${index}.body`}
                        render={({ field }) => (
                          <FormItem className='w-32'>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder='Body' />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {BODY_CODES.map((b) => (
                                  <SelectItem key={b} value={b}>
                                    {b.toUpperCase()}
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
                        name={`framework_mapping_rows.${index}.code`}
                        render={({ field }) => (
                          <FormItem className='flex-1'>
                            <FormControl>
                              <Input placeholder='Criterion code (e.g. 3.4.2)' {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        onClick={() => removeMapping(index)}
                        aria-label='Remove mapping'
                      >
                        <Trash2 className='h-4 w-4 text-destructive' />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => appendMapping({ body: '', code: '' })}
                  >
                    <Plus className='h-4 w-4 mr-2' />
                    Add mapping
                  </Button>
                </div>
              </FormItem>

              <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                <FormField
                  control={form.control}
                  name='default_owner_role'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Owner Role</FormLabel>
                      <FormControl>
                        <Input placeholder='e.g., dean, hod, coe' {...field} />
                      </FormControl>
                      <FormDescription className='text-xs'>
                        role_key from custom_roles.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='escalation_role'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Escalation Role</FormLabel>
                      <FormControl>
                        <Input
                          placeholder='e.g., cao, ceo'
                          value={field.value ?? ''}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                <FormField
                  control={form.control}
                  name='p1_sla_days'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>P1 (Red) SLA — days</FormLabel>
                      <FormControl>
                        <Input type='number' min={1} max={365} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='p2_sla_days'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>P2 (Yellow) SLA — days</FormLabel>
                      <FormControl>
                        <Input type='number' min={1} max={365} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormItem>
                <FormLabel>Evidence Required</FormLabel>
                <FormDescription className='text-xs'>
                  Checklist the finding-owner must upload before attestation.
                </FormDescription>
                <div className='mt-2'>
                  <EvidenceRequiredList
                    value={evidenceRequired}
                    onChange={setEvidenceRequired}
                  />
                </div>
              </FormItem>

              <div className='flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4'>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                  className='w-full sm:w-auto'
                >
                  Cancel
                </Button>
                <Button
                  type='submit'
                  disabled={isSubmitting}
                  className='w-full sm:w-auto'
                >
                  {isSubmitting && (
                    <Loader2 className='h-4 w-4 mr-2 animate-spin' />
                  )}
                  {mode === 'create' ? 'Create Override' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </Form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

