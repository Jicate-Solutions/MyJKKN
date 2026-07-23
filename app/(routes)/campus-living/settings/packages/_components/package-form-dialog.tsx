'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Loader2, Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';

import { useAdmissionPackages } from '@/hooks/campus-living/use-admission-packages';
import { useActiveHostelCategories } from '@/hooks/campus-living/use-hostel-categories';
import { useActiveMessCategories } from '@/hooks/campus-living/use-mess-categories';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';

import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { AdmissionYearService } from '@/lib/services/admission/admission-year-service';
import { LookupService } from '@/lib/services/admission/lookup-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';

import type { AdmissionPackage } from '@/types/admission-packages';

// Radix Select forbids value="" on SelectItem (reserved for "unselected").
// Use this sentinel for all "Any / None" options, then normalize to '' on
// change so onSubmit can use `|| null` as usual.
const ANY = '__any__';
const toField  = (v: string) => (v === ANY ? '' : v);
const fromField = (v: string | undefined) => v || ANY;

// ── form schema ────────────────────────────────────────────────────────────
const formSchema = z.object({
  // eligibility dimensions
  institution_id:        z.string().uuid('Select an institution'),
  admission_year_id:     z.string().optional().or(z.literal('')),
  degree_id:             z.string().optional().or(z.literal('')),
  department_id:         z.string().optional().or(z.literal('')),
  programme_id:          z.string().optional().or(z.literal('')),
  quota_id:              z.string().optional().or(z.literal('')),
  gender:                z.enum(['', 'MALE', 'FEMALE']),
  community_category_ids: z.array(z.string()),
  // package contents
  name:                  z.string().min(2, 'Name must be at least 2 characters').max(120),
  description:           z.string().max(500).optional().or(z.literal('')),
  room_category_id:      z.string().uuid('Select a room category'),
  mess_category_id:      z.string().optional().or(z.literal('')),
  package_type:          z.enum(['package', 'non_package']),
  is_active:             z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

interface Option { id: string; name: string }

interface PackageFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  pkg?: AdmissionPackage;
  institutionId?: string;
}

export function PackageFormDialog({
  open,
  onOpenChange,
  mode,
  pkg,
  institutionId,
}: PackageFormDialogProps) {
  const { createPackage, updatePackage } = useAdmissionPackages();
  const { institutions } = useInstitutionsWithAccess();

  const [submitting, setSubmitting] = useState(false);

  // cascading dimension options
  const [degrees,     setDegrees]     = useState<Option[]>([]);
  const [departments, setDepartments] = useState<Option[]>([]);
  const [programmes,  setProgrammes]  = useState<Option[]>([]);
  const [admYears,    setAdmYears]    = useState<Option[]>([]);
  const [quotas,      setQuotas]      = useState<Option[]>([]);
  const [communities, setCommunities] = useState<Option[]>([]);
  const [communityOpen, setCommunityOpen] = useState(false);

  // load global lookups once per dialog open
  useEffect(() => {
    if (!open) return;
    LookupService.listQuotas(true)
      .then((rows) => setQuotas(rows.map((r) => ({ id: r.id, name: r.name }))))
      .catch(() => setQuotas([]));
    (createClientSupabaseClient() as any)
      .from('community_categories')
      .select('id, name')
      .order('name')
      .then(({ data }: { data: Option[] | null }) => setCommunities(data ?? []))
      .catch(() => setCommunities([]));
  }, [open]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      institution_id:        institutionId ?? pkg?.institution_id ?? '',
      admission_year_id:     '',
      degree_id:             '',
      department_id:         '',
      programme_id:          '',
      quota_id:              '',
      gender:                '',
      community_category_ids: [],
      name:                  '',
      description:           '',
      room_category_id:      '',
      mess_category_id:      '',
      package_type:          'package',
      is_active:             true,
    },
  });

  const watchedInstId  = form.watch('institution_id');
  const watchedDegId   = form.watch('degree_id');
  const watchedDepId   = form.watch('department_id');
  const watchedProgId  = form.watch('programme_id');

  // Hostel type (Boys/Girls) is a UI-only filter that gates the room/mess
  // dropdowns; it is NOT persisted. On edit it is derived from the saved room
  // (then mess) category; an explicit user pick overrides the derived value.
  // Derivation is a memo (not an effect) so it self-corrects once the active-
  // category lists finish loading — otherwise a cold-cache edit-open would
  // default a girls package to Boys and never recover. The filtered lists stay
  // empty until a type resolves, so the operator never sees boys + girls at once.
  const [hostelTypeOverride, setHostelTypeOverride] = useState<'boys' | 'girls' | ''>('');
  const { hostelCategories: allHostelCategories } = useActiveHostelCategories();
  const { messCategories: allMessCategories }     = useActiveMessCategories();

  const derivedHostelType = useMemo<'boys' | 'girls' | ''>(() => {
    if (mode !== 'edit' || !pkg) return '';
    const room = allHostelCategories.find((c) => c.id === pkg.room_category_id);
    const mess = pkg.mess_category_id
      ? allMessCategories.find((c) => c.id === pkg.mess_category_id)
      : undefined;
    if (room?.type === 'boys')  return 'boys';
    if (room?.type === 'girls') return 'girls';
    if (mess?.type === 'boys')  return 'boys';
    if (mess?.type === 'girls') return 'girls';
    if (allHostelCategories.length === 0) return ''; // lists not loaded yet — don't guess
    return 'boys'; // room/mess are mixed → either works; a mixed category shows under both
  }, [mode, pkg, allHostelCategories, allMessCategories]);

  const hostelType = hostelTypeOverride || derivedHostelType;

  const hostelCategories = useMemo(
    () => (hostelType
      ? allHostelCategories.filter((c) => c.type === hostelType || c.type === 'mixed')
      : []),
    [allHostelCategories, hostelType]
  );
  const messCategories = useMemo(
    () => (hostelType
      ? allMessCategories.filter((c) => c.type === hostelType || c.type === 'mixed')
      : []),
    [allMessCategories, hostelType]
  );

  // institution change → load degrees; reset downstream
  useEffect(() => {
    if (!watchedInstId) { setDegrees([]); return; }
    DegreeService.getDegreesByInstitution(watchedInstId)
      .then((rows: { id: string; degree_name: string }[]) =>
        setDegrees(rows.map((d) => ({ id: d.id, name: d.degree_name })))
      )
      .catch(() => setDegrees([]));
  }, [watchedInstId]);

  // degree change → load departments (institution-scoped); reset downstream
  useEffect(() => {
    if (!watchedInstId || !watchedDegId) { setDepartments([]); return; }
    DepartmentService.getDepartmentsByInstitutionAndDegree(watchedInstId, watchedDegId)
      .then((rows: { id: string; department_name: string }[]) =>
        setDepartments(rows.map((d) => ({ id: d.id, name: d.department_name })))
      )
      .catch(() => setDepartments([]));
    form.setValue('department_id', '');
    form.setValue('programme_id', '');
    form.setValue('admission_year_id', '');
    setProgrammes([]);
    setAdmYears([]);
  }, [watchedDegId]); // eslint-disable-line react-hooks/exhaustive-deps

  // department change → load programmes; reset downstream
  useEffect(() => {
    if (!watchedDepId) { setProgrammes([]); return; }
    ProgramService.getProgramsByDepartment(watchedDepId)
      .then((rows: { id: string; program_name: string }[]) =>
        setProgrammes(rows.map((p) => ({ id: p.id, name: p.program_name })))
      )
      .catch(() => setProgrammes([]));
    form.setValue('programme_id', '');
    form.setValue('admission_year_id', '');
    setAdmYears([]);
  }, [watchedDepId]); // eslint-disable-line react-hooks/exhaustive-deps

  // institution change → load admission years (institution-wide now)
  useEffect(() => {
    if (!watchedInstId) { setAdmYears([]); return; }
    AdmissionYearService.getAdmissionYearsByInstitution(watchedInstId)
      .then((rows) =>
        setAdmYears(rows.map((y) => ({ id: y.id, name: y.admission_year_name })))
      )
      .catch(() => setAdmYears([]));
  }, [watchedInstId]); // eslint-disable-line react-hooks/exhaustive-deps


  // populate form when editing
  useEffect(() => {
    if (!open) return;
    setHostelTypeOverride(''); // each open starts from the derived hostel type
    if (mode === 'edit' && pkg) {
      form.reset({
        institution_id:         pkg.institution_id,
        admission_year_id:      pkg.admission_year_id ?? '',
        degree_id:              pkg.degree_id ?? '',
        department_id:          pkg.department_id ?? '',
        programme_id:           pkg.programme_id ?? '',
        quota_id:               pkg.quota_id ?? '',
        gender:                 (pkg.gender as '' | 'MALE' | 'FEMALE') ?? '',
        community_category_ids: pkg.community_category_ids ?? [],
        name:                   pkg.name,
        description:            pkg.description ?? '',
        room_category_id:       pkg.room_category_id,
        mess_category_id:       pkg.mess_category_id ?? '',
        package_type:           pkg.package_type,
        is_active:              pkg.is_active,
      });
    } else if (mode === 'create') {
      form.reset({
        institution_id:         institutionId ?? '',
        admission_year_id:      '',
        degree_id:              '',
        department_id:          '',
        programme_id:           '',
        quota_id:               '',
        gender:                 '',
        community_category_ids: [],
        name:                   '',
        description:            '',
        room_category_id:       '',
        mess_category_id:       '',
        package_type:           'package',
        is_active:              true,
      });
    }
  }, [open, mode, pkg, institutionId, form]);

  const onSubmit = async (data: FormValues) => {
    try {
      setSubmitting(true);
      const payload = {
        institution_id:         data.institution_id,
        admission_year_id:      data.admission_year_id || null,
        degree_id:              data.degree_id || null,
        department_id:          data.department_id || null,
        programme_id:           data.programme_id || null,
        quota_id:               data.quota_id || null,
        gender:                 (data.gender || null) as 'MALE' | 'FEMALE' | null,
        community_category_ids: data.community_category_ids,
        name:                   data.name,
        description:            data.description?.trim() || null,
        room_category_id:       data.room_category_id,
        mess_category_id:       data.mess_category_id || null,
        package_type:           data.package_type,
        is_active:              data.is_active,
      };
      if (mode === 'create') {
        await createPackage(payload);
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

  const selectedCommunityIds = form.watch('community_category_ids');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='w-[95vw] max-w-[680px] max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Create Package' : 'Edit Package'}
          </DialogTitle>
          <DialogDescription>
            Define eligibility dimensions and the room/mess bundle for this package.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>

            {/* ── Section A: Eligibility Dimensions ──────────────────────── */}
            <div className='space-y-3'>
              <p className='text-sm font-medium text-muted-foreground uppercase tracking-wide'>
                Eligibility Dimensions
              </p>
              <p className='text-xs text-muted-foreground -mt-1'>
                Leave a field blank to match any value for that dimension.
              </p>

              <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>

                {/* Institution */}
                <FormField
                  control={form.control}
                  name='institution_id'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Institution *</FormLabel>
                      <Select onValueChange={(v) => {
                        field.onChange(v);
                        form.setValue('degree_id', '');
                        form.setValue('department_id', '');
                        form.setValue('programme_id', '');
                        form.setValue('admission_year_id', '');
                        setDegrees([]); setDepartments([]); setProgrammes([]); setAdmYears([]);
                      }} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder='Select institution' />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(institutions ?? []).map((i) => (
                            <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Degree */}
                <FormField
                  control={form.control}
                  name='degree_id'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Degree</FormLabel>
                      <Select onValueChange={(v) => field.onChange(toField(v))} value={fromField(field.value)} disabled={degrees.length === 0}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder='Any degree' />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={ANY}>Any degree</SelectItem>
                          {degrees.map((d) => (
                            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Department */}
                <FormField
                  control={form.control}
                  name='department_id'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department</FormLabel>
                      <Select onValueChange={(v) => field.onChange(toField(v))} value={fromField(field.value)} disabled={departments.length === 0}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder='Any department' />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={ANY}>Any department</SelectItem>
                          {departments.map((d) => (
                            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Programme */}
                <FormField
                  control={form.control}
                  name='programme_id'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Programme</FormLabel>
                      <Select onValueChange={(v) => field.onChange(toField(v))} value={fromField(field.value)} disabled={programmes.length === 0}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder='Any programme' />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={ANY}>Any programme</SelectItem>
                          {programmes.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Admission Year — enabled only after Programme is selected */}
                <FormField
                  control={form.control}
                  name='admission_year_id'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Admission Year</FormLabel>
                      <Select
                        onValueChange={(v) => field.onChange(toField(v))}
                        value={fromField(field.value)}
                        disabled={admYears.length === 0}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={admYears.length === 0 ? 'Select programme first' : 'Any year'} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={ANY}>Any year</SelectItem>
                          {admYears.map((y) => (
                            <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Quota */}
                <FormField
                  control={form.control}
                  name='quota_id'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quota</FormLabel>
                      <Select onValueChange={(v) => field.onChange(toField(v))} value={fromField(field.value)}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder='Any quota' />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={ANY}>Any quota</SelectItem>
                          {quotas.map((q) => (
                            <SelectItem key={q.id} value={q.id}>{q.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Gender */}
                <FormField
                  control={form.control}
                  name='gender'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gender</FormLabel>
                      <Select
                        onValueChange={(v) => field.onChange(toField(v))}
                        value={fromField(field.value)}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder='Any gender' />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={ANY}>Any gender</SelectItem>
                          <SelectItem value='MALE'>Male</SelectItem>
                          <SelectItem value='FEMALE'>Female</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Community (multi-select) — inline list, no portal, avoids Dialog focus-trap conflict */}
                <FormField
                  control={form.control}
                  name='community_category_ids'
                  render={({ field }) => (
                    <FormItem className='sm:col-span-2'>
                      <FormLabel>Community</FormLabel>
                      {/* onBlur closes the list when focus leaves the whole container */}
                      <div
                        onBlur={(e) => {
                          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                            setCommunityOpen(false);
                          }
                        }}
                      >
                        {/* Trigger box */}
                        <div
                          role='button'
                          tabIndex={0}
                          onClick={() => setCommunityOpen((o) => !o)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setCommunityOpen((o) => !o);
                            }
                          }}
                          className='flex flex-wrap gap-1 min-h-[36px] rounded-md border px-3 py-2 cursor-pointer hover:bg-accent/10 transition-colors'
                        >
                          {selectedCommunityIds.length === 0 ? (
                            <span className='text-sm text-muted-foreground self-center'>
                              Any community (click to restrict)
                            </span>
                          ) : (
                            selectedCommunityIds.map((id) => {
                              const c = communities.find((x) => x.id === id);
                              return (
                                <Badge key={id} variant='secondary' className='gap-1 text-xs'>
                                  {c?.name ?? id.slice(0, 8)}
                                  <button
                                    type='button'
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      field.onChange(selectedCommunityIds.filter((x) => x !== id));
                                    }}
                                    className='rounded-full hover:bg-muted'
                                  >
                                    <X className='h-3 w-3' />
                                  </button>
                                </Badge>
                              );
                            })
                          )}
                          <ChevronsUpDown className='h-4 w-4 ml-auto text-muted-foreground self-center shrink-0' />
                        </div>

                        {/* Inline dropdown — renders in the form flow, no portal */}
                        {communityOpen && (
                          <div className='mt-1 rounded-md border bg-popover shadow-md'>
                            <Command>
                              <CommandInput placeholder='Search community…' />
                              <CommandList className='max-h-[200px]'>
                                <CommandEmpty>No communities found.</CommandEmpty>
                                <CommandGroup>
                                  {communities.map((c) => {
                                    const selected = selectedCommunityIds.includes(c.id);
                                    return (
                                      <CommandItem
                                        key={c.id}
                                        value={c.name}
                                        onSelect={() => {
                                          field.onChange(
                                            selected
                                              ? selectedCommunityIds.filter((x) => x !== c.id)
                                              : [...selectedCommunityIds, c.id]
                                          );
                                        }}
                                      >
                                        <Check
                                          className={cn('mr-2 h-4 w-4', selected ? 'opacity-100' : 'opacity-0')}
                                        />
                                        {c.name}
                                      </CommandItem>
                                    );
                                  })}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </div>
                        )}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

              </div>
            </div>

            {/* ── Section B: Package Contents ─────────────────────────────── */}
            <div className='space-y-3 border-t pt-4'>
              <p className='text-sm font-medium text-muted-foreground uppercase tracking-wide'>
                Package Contents
              </p>

              <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>

                {/* Package Name */}
                <FormField
                  control={form.control}
                  name='name'
                  render={({ field }) => (
                    <FormItem className='sm:col-span-2'>
                      <FormLabel>Package Name *</FormLabel>
                      <FormControl>
                        <Input placeholder='e.g., Standard Residential Package' {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Package Type */}
                <FormField
                  control={form.control}
                  name='package_type'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value='package'>Package (Bundled)</SelectItem>
                          <SelectItem value='non_package'>Non-Package</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Hostel Type — UI-only gate that filters the room/mess lists below */}
                <div className='sm:col-span-2 space-y-2'>
                  <label className='text-sm font-medium leading-none'>Hostel Type *</label>
                  <Select
                    value={hostelType || undefined}
                    onValueChange={(v) => {
                      setHostelTypeOverride(v as 'boys' | 'girls');
                      // clear any selection from the other type so it can't persist
                      form.setValue('room_category_id', '');
                      form.setValue('mess_category_id', '');
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='Select hostel type' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='boys'>Boys</SelectItem>
                      <SelectItem value='girls'>Girls</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className='text-xs text-muted-foreground'>
                    Choose a hostel type to filter the room &amp; mess categories below.
                  </p>
                </div>

                {/* Room Category */}
                <FormField
                  control={form.control}
                  name='room_category_id'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Room Category *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={!hostelType}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={hostelType ? 'Select room category' : 'Select hostel type first'} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(hostelCategories ?? []).map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Mess Category */}
                <FormField
                  control={form.control}
                  name='mess_category_id'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mess Category</FormLabel>
                      <Select onValueChange={(v) => field.onChange(toField(v))} value={fromField(field.value)} disabled={!hostelType}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={hostelType ? 'None' : 'Select hostel type first'} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={ANY}>None</SelectItem>
                          {(messCategories ?? []).map((m) => (
                            <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Active toggle */}
                <FormField
                  control={form.control}
                  name='is_active'
                  render={({ field }) => (
                    <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3 self-end'>
                      <FormLabel className='text-sm mb-0'>Active</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* Description */}
                <FormField
                  control={form.control}
                  name='description'
                  render={({ field }) => (
                    <FormItem className='sm:col-span-2'>
                      <FormLabel>Description <span className='text-muted-foreground font-normal'>(Optional)</span></FormLabel>
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

              </div>
            </div>

            <div className='flex flex-col-reverse sm:flex-row justify-end gap-3 pt-2 border-t'>
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
                {mode === 'create' ? 'Create Package' : 'Save Changes'}
              </Button>
            </div>

          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
