'use client';

import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';

import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { BosComposition } from '@/types/bos';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionContext } from '@/hooks/use-institution-context';
import { useAcademicYears } from '@/hooks/use-academic-years';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BosInstitutionOption {
  id: string;
  name: string;
  institution_code: string;
  myjkkn_institution_ids: string[];
}

interface Board { id: string; board_code: string; board_name: string; }

// ── Schema ────────────────────────────────────────────────────────────────────

const compositionFormSchema = z.object({
  institutions_id: z.string().min(1, 'Institution is required'),
  board_id:        z.string().min(1, 'Board is required'),
  composition_title: z.string().min(1, 'Title is required').max(500),
  term_start_date: z.string().min(1, 'Start date is required'),
  term_end_date:   z.string().min(1, 'End date is required'),
  academic_year:   z.string().min(1, 'Academic year is required'),
  constituted_by:  z.string().optional(),
  ratified_by_gc:  z.boolean(),
  ratified_date:   z.string().optional(),
  is_active:       z.boolean(),
  notes:           z.string().optional(),
});

export type CompositionFormValues = z.infer<typeof compositionFormSchema>;

// ── Props ─────────────────────────────────────────────────────────────────────

interface CompositionFormProps {
  composition?: BosComposition;
  isSubmitting: boolean;
  onSubmit: (data: CompositionFormValues) => void;
  onCancel: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function addThreeYears(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  d.setFullYear(d.getFullYear() + 3);
  return d.toISOString().split('T')[0];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CompositionForm({
  composition,
  isSubmitting,
  onSubmit,
  onCancel,
}: CompositionFormProps) {
  const { isSuperAdmin, isLoading: permissionsLoading } = usePermissions();

  // Own institution context for non-admins (auto-fill).
  const { data: ownCtx, isLoading: ownCtxLoading } = useInstitutionContext();

  // All institutions for super-admin picker — sourced from COE API (canonical names, CAS deduped).
  const { data: allInstitutions = [], isLoading: allCtxLoading } = useQuery<BosInstitutionOption[]>({
    queryKey: ['bos', 'institutions'],
    queryFn: async () => {
      const r = await fetch('/api/bos/institutions');
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!isSuperAdmin,
    staleTime: 5 * 60 * 1000,
  });

  const form = useForm<CompositionFormValues>({
    resolver: zodResolver(compositionFormSchema),
    defaultValues: composition
      ? {
          institutions_id: composition.institutions_id,
          board_id:        composition.board_id,
          composition_title: composition.composition_title,
          term_start_date: composition.term_start_date,
          term_end_date:   composition.term_end_date,
          academic_year:   composition.academic_year,
          constituted_by:  composition.constituted_by ?? '',
          ratified_by_gc:  composition.ratified_by_gc,
          ratified_date:   composition.ratified_date ?? '',
          is_active:       composition.is_active,
          notes:           composition.notes ?? '',
        }
      : {
          institutions_id: '',
          board_id: '',
          composition_title: '',
          term_start_date: '',
          term_end_date: '',
          academic_year: '',
          constituted_by: '',
          ratified_by_gc: false,
          ratified_date: '',
          is_active: true,
          notes: '',
        },
  });

  const ratifiedByGc = form.watch('ratified_by_gc');
  const institutionsId = form.watch('institutions_id');

  // Auto-fill institution for non-super-admins once context resolves.
  useEffect(() => {
    if (!composition && !isSuperAdmin && ownCtx?.myjkkn_id) {
      form.setValue('institutions_id', ownCtx.myjkkn_id);
    }
  }, [ownCtx?.myjkkn_id, isSuperAdmin, composition, form]);

  // Reset board when institution changes (create mode only); skip initial mount.
  const institutionInitialized = useRef(false);
  useEffect(() => {
    if (!institutionInitialized.current) { institutionInitialized.current = true; return; }
    if (!composition) form.setValue('board_id', '');
  }, [institutionsId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Boards ──────────────────────────────────────────────────────────────────
  // Pass the MyJKKN institution UUID to the boards route.  The server resolves
  // CAS siblings (Aided+SF) via counselling_code lookup, so a single UUID is
  // sufficient for both CAS and non-CAS institutions.
  const boardInstitutionId = isSuperAdmin ? institutionsId || null : ownCtx?.myjkkn_id ?? null;

  const { data: boardsRaw = [], isLoading: loadingBoards } = useQuery<Board[]>({
    queryKey: ['bos', 'boards', boardInstitutionId],
    enabled: !!boardInstitutionId,
    queryFn: async () => {
      const res = await fetch(`/api/bos/boards?institutionsId=${boardInstitutionId}`);
      if (!res.ok) return [];
      const json = await res.json();
      return (Array.isArray(json) ? json : (json?.data ?? [])) as Board[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // ── Academic years ───────────────────────────────────────────────────────────
  const { data: academicYearsData } = useAcademicYears(institutionsId || undefined);
  const academicYears = academicYearsData?.data ?? [];

  // Ensure the current value is always selectable (edit mode — year may be inactive).
  const academicYearOptions = [
    ...academicYears.map((ay) => ({ value: ay.academic_year_name, label: ay.academic_year_name })),
    ...(composition?.academic_year && !academicYears.some((ay) => ay.academic_year_name === composition.academic_year)
      ? [{ value: composition.academic_year, label: composition.academic_year }]
      : []),
  ];

  // ── Constituted By ─────────────────────────────────────────────────────────
  // Migration 20260424 converted bos_compositions.constituted_by from a
  // staff(id) FK to VARCHAR(255) free text. Users enter authority labels here
  // (e.g. "Principal", "Academic Council", "Vice Chancellor") rather than a
  // specific staff record — so this is a plain text input, not a picker.

  const handleStartDateChange = (value: string) => {
    form.setValue('term_start_date', value);
    if (value) {
      form.setValue('term_end_date', addThreeYears(value));
      const year = new Date(value).getFullYear();
      if (!form.getValues('academic_year')) {
        form.setValue('academic_year', `${year}-${year + 1}`);
      }
    }
  };

  if (permissionsLoading || (!isSuperAdmin && ownCtxLoading) || (isSuperAdmin && allCtxLoading)) {
    return (
      <div className='space-y-3'>
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className='h-16 w-full' />)}
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>

        {/* ── Institution + Board ──────────────────────────────────────────── */}
        <Card>
          <CardContent className='pt-4 pb-4 space-y-3'>
            <div className='grid gap-3 md:grid-cols-2'>

              {/* Institution — super-admin picker / non-admin hidden */}
              {isSuperAdmin ? (
                <FormField
                  control={form.control}
                  name='institutions_id'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Institution <span className='text-destructive'>*</span></FormLabel>
                      <SearchableSelect
                        value={field.value}
                        onValueChange={(val) => {
                          field.onChange(val);
                          form.setValue('board_id', '');
                        }}
                        options={allInstitutions.map((i) => ({ value: i.id, label: i.name }))}
                        placeholder='Select institution'
                        searchPlaceholder='Search institution…'
                        className='w-full'
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <input type='hidden' {...form.register('institutions_id')} />
              )}

              {/* Board */}
              <FormField
                control={form.control}
                name='board_id'
                render={({ field }) => (
                  <FormItem className={isSuperAdmin ? '' : 'md:col-span-2'}>
                    <FormLabel>Board <span className='text-destructive'>*</span></FormLabel>
                    <SearchableSelect
                      value={field.value}
                      onValueChange={field.onChange}
                      options={boardsRaw.map((b) => ({
                        value: b.id,
                        label: `${b.board_name} (${b.board_code})`,
                      }))}
                      placeholder={!institutionsId ? 'Select institution first' : 'Select board'}
                      searchPlaceholder='Search board…'
                      loading={loadingBoards}
                      disabled={!institutionsId}
                      className='w-full'
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Composition Details ──────────────────────────────────────────── */}
        <Card>
          <CardHeader className='py-3 px-4'>
            <CardTitle className='text-sm font-medium'>Composition Details</CardTitle>
          </CardHeader>
          <CardContent className='px-4 pb-4 space-y-3'>

            {/* Title */}
            <FormField
              control={form.control}
              name='composition_title'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Composition Title <span className='text-destructive'>*</span></FormLabel>
                  <FormControl>
                    <Input
                      placeholder='e.g. Board of Studies – Computer Science (2024-2027)'
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Academic Year + Start Date + End Date */}
            <div className='grid gap-3 md:grid-cols-3'>
              <FormField
                control={form.control}
                name='academic_year'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Academic Year <span className='text-destructive'>*</span></FormLabel>
                    <SearchableSelect
                      value={field.value}
                      onValueChange={field.onChange}
                      options={academicYearOptions}
                      placeholder='Select year'
                      searchPlaceholder='Search year…'
                      disabled={!institutionsId}
                      className='w-full'
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='term_start_date'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date <span className='text-destructive'>*</span></FormLabel>
                    <FormControl>
                      <Input
                        type='date'
                        {...field}
                        onChange={(e) => handleStartDateChange(e.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='term_end_date'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date <span className='text-destructive'>*</span></FormLabel>
                    <FormControl>
                      <Input type='date' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Governance ───────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className='py-3 px-4'>
            <CardTitle className='text-sm font-medium'>Governance &amp; Status</CardTitle>
          </CardHeader>
          <CardContent className='px-4 pb-4 space-y-3'>

            {/* Constituted By — free-text authority label (Principal / Academic Council / VC) */}
            <FormField
              control={form.control}
              name='constituted_by'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Constituted By</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='e.g. Principal, Academic Council, Vice Chancellor'
                      maxLength={255}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Ratified by GC + Active side by side */}
            <div className='grid gap-3 md:grid-cols-2'>
              <FormField
                control={form.control}
                name='ratified_by_gc'
                render={({ field }) => (
                  <FormItem className='flex items-center justify-between rounded-lg border px-3 py-2.5'>
                    <FormLabel className='text-sm cursor-pointer mb-0'>
                      Ratified by Governing Council
                    </FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='is_active'
                render={({ field }) => (
                  <FormItem className='flex items-center justify-between rounded-lg border px-3 py-2.5'>
                    <FormLabel className='text-sm cursor-pointer mb-0'>Active Composition</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* Ratification date (conditional) */}
            {ratifiedByGc && (
              <FormField
                control={form.control}
                name='ratified_date'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ratification Date</FormLabel>
                    <FormControl>
                      <Input type='date' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Notes */}
            <FormField
              control={form.control}
              name='notes'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Internal Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='Any internal remarks about this composition'
                      className='resize-none'
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* ── Actions ─────────────────────────────────────────────────────── */}
        <div className='flex justify-end gap-3'>
          <Button type='button' variant='outline' onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type='submit' disabled={isSubmitting}>
            {isSubmitting
              ? 'Saving…'
              : composition
              ? 'Update Composition'
              : 'Create Composition'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
