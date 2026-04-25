'use client';

import { useEffect, useState } from 'react';
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

import { BosComposition } from '@/types/bos';
import { usePermissions } from '@/hooks/use-permissions';
import { logger } from '@/lib/utils/enhanced-logger';

// ── Types for dropdowns ───────────────────────────────────────────────────────

interface Institution {
  id: string;
  name: string;
}

interface Board {
  id: string;
  board_code: string;
  board_name: string;
}

// ── Validation Schema ─────────────────────────────────────────────────────────

const compositionFormSchema = z.object({
  institutions_id: z.string().min(1, 'Institution is required'),
  board_id: z.string().min(1, 'Board is required'),
  composition_title: z.string().min(1, 'Title is required').max(500),
  term_start_date: z.string().min(1, 'Start date is required'),
  term_end_date: z.string().min(1, 'End date is required'),
  academic_year: z
    .string()
    .regex(/^\d{4}-\d{4}$/, 'Format must be YYYY-YYYY (e.g. 2024-2025)')
    .min(1, 'Academic year is required'),
  constituted_by: z.string().optional(),
  ratified_by_gc: z.boolean(),
  ratified_date: z.string().optional(),
  is_active: z.boolean(),
  notes: z.string().optional(),
});

export type CompositionFormValues = z.infer<typeof compositionFormSchema>;

// ── Props ─────────────────────────────────────────────────────────────────────

interface CompositionFormProps {
  composition?: BosComposition; // undefined = create mode
  isSubmitting: boolean;
  onSubmit: (data: CompositionFormValues) => void;
  onCancel: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Given a start date string (YYYY-MM-DD), returns the date 3 years later */
function addThreeYears(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  d.setFullYear(d.getFullYear() + 3);
  return d.toISOString().split('T')[0];
}

/** Derive academic year string from a date string */
function deriveAcademicYear(dateStr: string): string {
  if (!dateStr) return '';
  const year = new Date(dateStr).getFullYear();
  return `${year}-${year + 1}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CompositionForm({
  composition,
  isSubmitting,
  onSubmit,
  onCancel,
}: CompositionFormProps) {
  const { userProfile, isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [loadingBoards, setLoadingBoards] = useState(false);

  const form = useForm<CompositionFormValues>({
    resolver: zodResolver(compositionFormSchema),
    defaultValues: composition
      ? {
          institutions_id: composition.institutions_id,
          board_id: composition.board_id,
          composition_title: composition.composition_title,
          term_start_date: composition.term_start_date,
          term_end_date: composition.term_end_date,
          academic_year: composition.academic_year,
          constituted_by: composition.constituted_by ?? '',
          ratified_by_gc: composition.ratified_by_gc,
          ratified_date: composition.ratified_date ?? '',
          is_active: composition.is_active,
          notes: composition.notes ?? '',
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

  // Fetch institutions from COE database
  useEffect(() => {
    fetch('/api/bos/institutions')
      .then((r) => r.json())
      .then((list: Institution[]) => {
        setInstitutions(Array.isArray(list) ? list : []);
        if (!composition && !isSuperAdmin && Array.isArray(list) && list.length === 1) {
          form.setValue('institutions_id', list[0].id);
        }
      })
      .catch((err) => logger.error('academic/bos', 'Failed to fetch institutions', err));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fast path: set institution from profile (non-admin)
  useEffect(() => {
    if (!composition && !isSuperAdmin && userProfile?.institution_id) {
      form.setValue('institutions_id', userProfile.institution_id);
    }
  }, [userProfile, composition, isSuperAdmin, form]);

  // Fetch boards when institution changes
  useEffect(() => {
    if (!institutionsId) {
      setBoards([]);
      return;
    }
    setLoadingBoards(true);
    fetch(`/api/bos/boards?institutionsId=${institutionsId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Boards fetch failed: ${r.status}`);
        return r.json();
      })
      .then((list) => setBoards(Array.isArray(list) ? list : []))
      .catch((err) => {
        logger.error('academic/bos', 'Failed to fetch boards', err);
        setBoards([]);
      })
      .finally(() => setLoadingBoards(false));

    // Reset board when institution changes (create mode only)
    if (!composition) form.setValue('board_id', '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [institutionsId]);

  // When start date changes: auto-fill end date (+3 years) and academic year
  const handleStartDateChange = (value: string) => {
    form.setValue('term_start_date', value);
    if (value) {
      const endDate = addThreeYears(value);
      form.setValue('term_end_date', endDate);
      const acYear = deriveAcademicYear(value);
      if (!form.getValues('academic_year')) {
        form.setValue('academic_year', acYear);
      }
    }
  };

  if (permissionsLoading) {
    return (
      <div className='space-y-4'>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className='h-16 w-full' />
        ))}
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>

        {/* ── Institution selector (super admin only) ─────────────────── */}
        {isSuperAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Institution</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name='institutions_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Institution <span className='text-destructive'>*</span></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select institution first' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {institutions.map((inst) => (
                          <SelectItem key={inst.id} value={inst.id}>
                            {inst.name}
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

        {/* ── Composition Details ───────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Composition Details</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>

            {/* Board */}
            <FormField
              control={form.control}
              name='board_id'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Board <span className='text-destructive'>*</span></FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={!institutionsId || loadingBoards}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={
                          !institutionsId ? 'Select institution first'
                          : loadingBoards ? 'Loading boards...'
                          : 'Select board'
                        } />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {boards.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.board_name} ({b.board_code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    The BoS board this composition belongs to.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                  <FormDescription>
                    Formal title that will appear on meeting notices and official documents.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Academic Year */}
            <FormField
              control={form.control}
              name='academic_year'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Academic Year <span className='text-destructive'>*</span></FormLabel>
                  <FormControl>
                    <Input placeholder='e.g. 2024-2025' {...field} />
                  </FormControl>
                  <FormDescription>
                    Auto-filled when you set the start date. Format: YYYY-YYYY.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* ── Term Period ───────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Term Period</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid gap-4 md:grid-cols-2'>
              {/* Start Date */}
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
                    <FormDescription>
                      End date and academic year are auto-filled (start + 3 years).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* End Date */}
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

        {/* ── Governance & Status ───────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Governance &amp; Status</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>

            {/* Constituted By */}
            <FormField
              control={form.control}
              name='constituted_by'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Constituted By</FormLabel>
                  <FormControl>
                    <Input placeholder='e.g. Principal / Academic Council / Vice Chancellor' {...field} />
                  </FormControl>
                  <FormDescription>
                    Authority who constituted this composition (for official records).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Ratified by Governing Council */}
            <FormField
              control={form.control}
              name='ratified_by_gc'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-4'>
                  <div className='space-y-0.5'>
                    <FormLabel className='text-base'>Ratified by Governing Council</FormLabel>
                    <FormDescription>
                      Mark when the GC has formally approved this composition.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* Ratification Date (shown only when ratified_by_gc is true) */}
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
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Active Status */}
            <FormField
              control={form.control}
              name='is_active'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-4'>
                  <div className='space-y-0.5'>
                    <FormLabel className='text-base'>Active Composition</FormLabel>
                    <FormDescription>
                      Only active compositions appear when scheduling meetings.
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
              : composition
              ? 'Update Composition'
              : 'Create Composition'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
