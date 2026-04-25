'use client';

// Per-institution parameter override form dialog (Sprint 01 — Thrash T2).
//
// Two modes:
//   - create: institution picker active, excludes institutions that already
//     have an override for this code.
//   - edit:   institution_id is locked (cannot move an override between
//     institutions — delete + create instead).
//
// Shape matches parameter-form-dialog.tsx so reviewers can diff the two. The
// override form is deliberately a separate component because:
//   1. Institution picker is NOT present in the system-parameter form.
//   2. The override form is only reachable from
//      /audit/parameters/[code]/overrides, which is scoped to ONE code; so the
//      code + parameter_group + name defaults are inherited from the system
//      row instead of being editable.
//
// Write path: POST or PATCH /api/audit/parameters/[code]/overrides via the
// `use-parameter-overrides` mutations.

import { useEffect, useMemo, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { EvidenceRequiredList } from './evidence-required-list';
import {
  useCreateOverride,
  useUpdateOverride,
  useInstitutionsForOverridePicker,
  type OverridePayload,
} from '@/hooks/audit/use-parameter-overrides';
import type {
  AuditParameterCatalogRow,
  EvidenceRequirementItem,
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
  'inc',
] as const;

const formSchema = z.object({
  institution_id: z.string().min(1, 'Institution is required'),
  default_owner_role: z.string().min(1, 'Default owner role is required').max(50),
  escalation_role: z.string().max(50).optional().nullable(),
  p1_sla_days: z.coerce.number().int().min(1).max(365),
  p2_sla_days: z.coerce.number().int().min(1).max(365),
  description: z.string().max(1000).optional().nullable(),
  is_active: z.boolean().default(true),
  framework_mapping_rows: z
    .array(z.object({ body: z.string(), code: z.string() }))
    .default([]),
});

type FormValues = z.infer<typeof formSchema>;

interface OverrideFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  /** Parameter code the override is scoped to. */
  code: string;
  /** The system row — used to prefill defaults on create. */
  systemRow: AuditParameterCatalogRow;
  /** Existing override when editing. */
  entity?: AuditParameterCatalogRow;
  /** Institutions that already have an override (excluded from the picker on create). */
  existingInstitutionIds?: string[];
}

export function OverrideFormDialog({
  open,
  onOpenChange,
  mode,
  code,
  systemRow,
  entity,
  existingInstitutionIds = [],
}: OverrideFormDialogProps) {
  const createMutation = useCreateOverride({ code });
  const updateMutation = useUpdateOverride({ code });
  const { data: institutions = [], isLoading: institutionsLoading } =
    useInstitutionsForOverridePicker();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      institution_id: '',
      default_owner_role: systemRow.default_owner_role,
      escalation_role: systemRow.escalation_role ?? '',
      p1_sla_days: systemRow.p1_sla_days,
      p2_sla_days: systemRow.p2_sla_days,
      description: systemRow.description ?? '',
      is_active: true,
      framework_mapping_rows: Object.entries(systemRow.framework_mapping ?? {}).map(
        ([body, value]) => ({ body, code: String(value ?? '') })
      ),
    },
  });

  const {
    fields: mappingFields,
    append: appendMapping,
    remove: removeMapping,
  } = useFieldArray({
    control: form.control,
    name: 'framework_mapping_rows',
  });

  const [evidenceRequired, setEvidenceRequired] = useState<EvidenceRequirementItem[]>(
    systemRow.evidence_required ?? []
  );

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && entity) {
      form.reset({
        institution_id: entity.institution_id ?? '',
        default_owner_role: entity.default_owner_role,
        escalation_role: entity.escalation_role ?? '',
        p1_sla_days: entity.p1_sla_days,
        p2_sla_days: entity.p2_sla_days,
        description: entity.description ?? '',
        is_active: entity.is_active,
        framework_mapping_rows: Object.entries(entity.framework_mapping ?? {}).map(
          ([body, value]) => ({ body, code: String(value ?? '') })
        ),
      });
      setEvidenceRequired(entity.evidence_required ?? []);
    } else {
      form.reset({
        institution_id: '',
        default_owner_role: systemRow.default_owner_role,
        escalation_role: systemRow.escalation_role ?? '',
        p1_sla_days: systemRow.p1_sla_days,
        p2_sla_days: systemRow.p2_sla_days,
        description: systemRow.description ?? '',
        is_active: true,
        framework_mapping_rows: Object.entries(systemRow.framework_mapping ?? {}).map(
          ([body, value]) => ({ body, code: String(value ?? '') })
        ),
      });
      setEvidenceRequired(systemRow.evidence_required ?? []);
    }
  }, [open, mode, entity, systemRow, form]);

  // On create: institutions that do NOT already have an override for this code.
  const pickerInstitutions = useMemo(() => {
    if (mode === 'edit') return institutions;
    const exclude = new Set(existingInstitutionIds);
    return institutions.filter((i) => !exclude.has(i.id));
  }, [mode, institutions, existingInstitutionIds]);

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const onSubmit = async (values: FormValues) => {
    const framework_mapping = values.framework_mapping_rows.reduce<Record<string, string>>(
      (acc, row) => {
        if (row.body && row.code) acc[row.body] = row.code;
        return acc;
      },
      {}
    );

    const payload: OverridePayload = {
      institution_id: values.institution_id,
      name: systemRow.name, // inherited; service merges with system row
      description: values.description ?? null,
      framework_mapping,
      default_owner_role: values.default_owner_role,
      escalation_role: values.escalation_role || null,
      p1_sla_days: values.p1_sla_days,
      p2_sla_days: values.p2_sla_days,
      evidence_required: evidenceRequired,
      is_active: values.is_active,
    };

    try {
      if (mode === 'edit') {
        await updateMutation.mutateAsync(payload);
        toast.success('Override updated');
      } else {
        await createMutation.mutateAsync(payload);
        toast.success('Override created');
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save override');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='w-[95vw] max-w-[720px] max-h-[92vh] p-0'>
        <DialogHeader className='px-4 pt-4 sm:px-6 sm:pt-6'>
          <DialogTitle>
            {mode === 'create'
              ? `Create Override — ${systemRow.code}`
              : `Edit Override — ${systemRow.code}`}
          </DialogTitle>
          <DialogDescription>
            Values apply to the selected institution only. System defaults remain
            unchanged. Unfilled fields fall back to the system row.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className='max-h-[calc(92vh-140px)] px-4 sm:px-6'>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className='space-y-4 pb-4'
            >
              <FormField
                control={form.control}
                name='institution_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Institution</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={mode === 'edit' || institutionsLoading}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              institutionsLoading
                                ? 'Loading institutions…'
                                : 'Select institution'
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {pickerInstitutions.length === 0 ? (
                          <div className='px-3 py-2 text-xs text-muted-foreground'>
                            {mode === 'create'
                              ? 'Every institution already has an override for this parameter.'
                              : 'No institutions available.'}
                          </div>
                        ) : (
                          pickerInstitutions.map((inst) => (
                            <SelectItem key={inst.id} value={inst.id}>
                              {inst.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormDescription className='text-xs'>
                      {mode === 'edit'
                        ? 'Institution is locked. Delete and recreate to change it.'
                        : 'Each institution can have at most one override per parameter.'}
                    </FormDescription>
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
                        placeholder='Optional — override the system description for this institution.'
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
                  Defaults copied from the system row; edit to vary per institution.
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
                              <Input
                                placeholder='Criterion code (e.g. 3.4.2)'
                                {...field}
                              />
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
                  Defaults copied from the system row. Empty list removes all items for
                  this institution.
                </FormDescription>
                <div className='mt-2'>
                  <EvidenceRequiredList
                    value={evidenceRequired}
                    onChange={setEvidenceRequired}
                  />
                </div>
              </FormItem>

              <FormField
                control={form.control}
                name='is_active'
                render={({ field }) => (
                  <FormItem className='flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3'>
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(checked) => field.onChange(!!checked)}
                      />
                    </FormControl>
                    <div className='space-y-1 leading-none'>
                      <FormLabel>Active</FormLabel>
                      <FormDescription className='text-xs'>
                        When inactive the institution falls back to the system default.
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

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
