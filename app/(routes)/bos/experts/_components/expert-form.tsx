'use client';

import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

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
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import {
  BosExternalExpert,
  BosExpertCategory,
  BOS_EXPERT_CATEGORY_LABELS,
} from '@/types/bos';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionContext } from '@/hooks/use-institution-context';
import { useBosInstitutionScope } from '@/hooks/bos/use-bos-institution-scope';
import { useBosMemberTypes } from '@/hooks/bos/use-bos-member-types';

// The `category` column only accepts these 5 values. Member types are a broader
// admin-managed superset (Chairman/HOD/Principal/…), so the dropdown is sourced
// from member-type rows whose base_type is one of these expert categories.
const EXPERT_CATEGORY_VALUES = new Set(
  Object.keys(BOS_EXPERT_CATEGORY_LABELS) as BosExpertCategory[],
);

// ── Validation Schema ─────────────────────────────────────────────────────────

const expertFormSchema = z.object({
  institutions_id: z.string().min(1, 'Institution is required'),
  name: z.string().min(1, 'Name is required').max(255),
  title: z.string().optional(),
  designation: z.string().optional(),
  institution_name: z.string().optional(),
  department_name: z.string().optional(),
  address: z.string().optional(),
  contact_no: z.string().optional(),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  category: z.enum([
    'university_nominee',
    'subject_expert',
    'academic_expert',
    'industry_expert',
    'alumni',
    'startup',
    'student',
    'faculty_member',
    'chairman',
  ]),
  specialization: z.string().optional(),
  qualifications: z.string().optional(),
  // One-way distance to the institution. Auto-doubled by the TA/DA rate
  // engine for round-trip travel reimbursement (km × 2 × ₹5). Optional —
  // experts without a distance get honorarium only, no TA.
  distance_km: z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((v) => {
      if (v === '' || v === null || v === undefined) return null;
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) && n >= 0 ? n : null;
    })
    .nullable()
    .optional(),
  is_active: z.boolean().default(true),
  notes: z.string().optional(),
});

export type ExpertFormValues = z.infer<typeof expertFormSchema>;

// ── Props ─────────────────────────────────────────────────────────────────────

interface ExpertFormProps {
  expert?: BosExternalExpert;         // undefined = create mode
  isSubmitting: boolean;
  onSubmit: (data: ExpertFormValues) => void;
  onCancel: () => void;
}

// Shape returned by /api/bos/institutions (COE-sourced canonical names,
// CAS Aided+Self deduped into one row — same source as the compositions form).
interface BosInstitutionOption {
  id: string;
  name: string;
  institution_code: string;
  myjkkn_institution_ids: string[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ExpertForm({ expert, isSubmitting, onSubmit, onCancel }: ExpertFormProps) {
  const { isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  // Non-admins: own institution resolved automatically.
  // Super-admins: disabled (returns undefined); they pick from the dropdown.
  const { data: institutionCtx } = useInstitutionContext();
  // Super-admin institution list for the picker dropdown — /api/bos/institutions
  // gives the COE canonical name (e.g. "… (Autonomous)") with CAS Aided+Self
  // already merged into a single row, matching the other BoS pickers.
  const { data: allInstitutions = [] } = useQuery<BosInstitutionOption[]>({
    queryKey: ['bos', 'institutions'],
    queryFn: async () => {
      const r = await fetch('/api/bos/institutions');
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!isSuperAdmin,
    staleTime: 5 * 60 * 1000,
  });

  const form = useForm<ExpertFormValues>({
    resolver: zodResolver(expertFormSchema),
    defaultValues: expert
      ? {
          institutions_id: expert.institutions_id,
          name: expert.name,
          title: expert.title ?? '',
          designation: expert.designation ?? '',
          institution_name: expert.institution_name ?? '',
          department_name: expert.department_name ?? '',
          address: expert.address ?? '',
          contact_no: expert.contact_no ?? '',
          email: expert.email ?? '',
          category: expert.category,
          specialization: expert.specialization ?? '',
          qualifications: expert.qualifications ?? '',
          distance_km: expert.distance_km ?? null,
          is_active: expert.is_active,
          notes: expert.notes ?? '',
        }
      : {
          institutions_id: '',
          name: '',
          title: '',
          designation: '',
          institution_name: '',
          department_name: '',
          address: '',
          contact_no: '',
          email: '',
          category: 'subject_expert',
          specialization: '',
          qualifications: '',
          distance_km: null,
          is_active: true,
          notes: '',
        },
  });

  // ── Category options, sourced from member types ──────────────────────────
  // Scope member types to the selected institution (CAS-expanded). The query
  // stays disabled until an institution is resolved (scope.csv === null).
  const selectedInstitutionId = form.watch('institutions_id');
  const scope = useBosInstitutionScope(selectedInstitutionId || undefined);
  const { data: memberTypes = [] } = useBosMemberTypes(scope.csv, { isActive: true });

  const categoryOptions = useMemo<{ value: BosExpertCategory; label: string }[]>(() => {
    // Member-type rows that map to a valid expert category, deduped by base_type
    // (rows arrive pre-ordered by sort_order, so the first name wins).
    const fromTypes: { value: BosExpertCategory; label: string }[] = [];
    const seen = new Set<string>();
    for (const t of memberTypes) {
      if (!EXPERT_CATEGORY_VALUES.has(t.base_type as BosExpertCategory)) continue;
      if (seen.has(t.base_type)) continue;
      seen.add(t.base_type);
      fromTypes.push({ value: t.base_type as BosExpertCategory, label: t.name });
    }

    // Every expert category stays selectable even when the institution has no
    // member-type row for it (e.g. no university_nominee row) — member-type
    // rows only override the label and ordering.
    const options = [...fromTypes];
    for (const [value, label] of Object.entries(BOS_EXPERT_CATEGORY_LABELS) as [
      BosExpertCategory,
      string,
    ][]) {
      if (!seen.has(value)) options.push({ value, label });
    }
    return options;
  }, [memberTypes]);

  // Auto-set institution for non-admins once context resolves.
  useEffect(() => {
    if (expert || isSuperAdmin || !institutionCtx?.myjkkn_id) return;
    form.setValue('institutions_id', institutionCtx.myjkkn_id, { shouldValidate: true });
  }, [institutionCtx?.myjkkn_id, isSuperAdmin, expert, form]);

  if (permissionsLoading) {
    return (
      <div className='space-y-4'>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className='h-16 w-full' />
        ))}
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>

        {/* ── Institution selector (super admin only) ─────────────────── */}
        {isSuperAdmin && (
          <Card>
            <CardHeader className='pb-3'>
              <CardTitle className='text-base'>Institution</CardTitle>
            </CardHeader>
            <CardContent className='pt-0'>
              <FormField
                control={form.control}
                name='institutions_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Institution <span className='text-destructive'>*</span></FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      // Edit-mode CAS gap: the saved row may carry the sibling
                      // UUID that isn't the option's primary id — map it to the
                      // option that contains it so the picker doesn't go blank.
                      value={
                        allInstitutions.find((o) =>
                          o.myjkkn_institution_ids.includes(field.value)
                        )?.id ?? field.value
                      }
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select institution' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {allInstitutions.map((opt) => (
                          <SelectItem key={opt.id} value={opt.id}>
                            {opt.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
        )}

        {/* ── Identity ─────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className='pb-3'>
            <CardTitle className='text-base'>Expert Identity</CardTitle>
          </CardHeader>
          <CardContent className='pt-0 space-y-3'>
            <div className='grid gap-3 md:grid-cols-4'>
              {/* Title */}
              <FormField
                control={form.control}
                name='title'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ''}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {['Dr.', 'Prof.', 'Mr.', 'Ms.', 'Mrs.'].map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Full Name */}
              <div className='md:col-span-3'>
                <FormField
                  control={form.control}
                  name='name'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name <span className='text-destructive'>*</span></FormLabel>
                      <FormControl>
                        <Input placeholder='e.g. Rajesh Kumar' {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className='grid gap-3 md:grid-cols-2'>
              {/* Category */}
              <FormField
                control={form.control}
                name='category'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category <span className='text-destructive'>*</span></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select category' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categoryOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Designation */}
              <FormField
                control={form.control}
                name='designation'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Designation</FormLabel>
                    <FormControl>
                      <Input placeholder='e.g. Associate Professor' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Affiliation ────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className='pb-3'>
            <CardTitle className='text-base'>Affiliation</CardTitle>
          </CardHeader>
          <CardContent className='pt-0 space-y-3'>
            <div className='grid gap-3 md:grid-cols-2'>
              <FormField
                control={form.control}
                name='institution_name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Institution / Company</FormLabel>
                    <FormControl>
                      <Input placeholder='e.g. JKKN College of Arts and Science (Autonomous)' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='department_name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department</FormLabel>
                    <FormControl>
                      <Input placeholder='e.g. Department of Computer Science' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name='specialization'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Specialization</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='e.g. Machine Learning, Data Mining, Algorithms'
                      className='resize-none'
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className='grid gap-3 md:grid-cols-2'>
              <FormField
                control={form.control}
                name='qualifications'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Qualifications</FormLabel>
                    <FormControl>
                      <Input placeholder='e.g. MCA, M.Phil, Ph.D.' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='distance_km'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Distance to Institution (km, one-way)</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        inputMode='decimal'
                        min={0}
                        step='0.1'
                        placeholder='e.g. 45'
                        value={field.value ?? ''}
                        onChange={(e) =>
                          field.onChange(e.target.value === '' ? null : e.target.value)
                        }
                      />
                    </FormControl>
                    <FormDescription>
                      Auto-doubled for round-trip TA at ₹5/km. Leave blank if not applicable.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Contact ───────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className='pb-3'>
            <CardTitle className='text-base'>Contact Details</CardTitle>
          </CardHeader>
          <CardContent className='pt-0 space-y-3'>
            <div className='grid gap-3 md:grid-cols-2'>
              <FormField
                control={form.control}
                name='email'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type='email' placeholder='expert@institution.ac.in' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='contact_no'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Number</FormLabel>
                    <FormControl>
                      <Input placeholder='e.g. +91 98765 43210' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name='address'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='Full postal address'
                      className='resize-none'
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* ── Settings ──────────────────────────────────────────────────── */}
        <Card>
          <CardContent className='p-4 space-y-3'>
            <FormField
              control={form.control}
              name='notes'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Internal Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='Any internal notes about this expert (not printed on documents)'
                      className='resize-none'
                      rows={2}
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
                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-4'>
                  <div className='space-y-0.5'>
                    <FormLabel className='text-base'>Active</FormLabel>
                    <FormDescription>
                      Inactive experts will not appear in composition member lists.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* ── Actions ───────────────────────────────────────────────────── */}
        <div className='flex justify-end gap-3'>
          <Button type='button' variant='outline' onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type='submit' disabled={isSubmitting}>
            {isSubmitting
              ? 'Saving...'
              : expert
              ? 'Update Expert'
              : 'Add Expert'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
