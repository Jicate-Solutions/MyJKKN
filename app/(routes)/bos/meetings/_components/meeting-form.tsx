'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Phone, UserCircle2 } from 'lucide-react';

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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

import { BosMeeting, BOS_MEETING_TYPE_LABELS, BosMember } from '@/types/bos';
import { usePermissions } from '@/hooks/use-permissions';
import { useAcademicYears } from '@/hooks/use-academic-years';
import { useBosBoardScope } from '@/hooks/bos/use-bos-board-scope';
import { BosMeetingService } from '@/lib/services/bos/bos-meeting-service';
import { logger } from '@/lib/utils/enhanced-logger';

// ── Types for dropdowns ───────────────────────────────────────────────────────

interface CompositionOption {
  id: string;
  composition_title: string;
  academic_year: string;
  board_id: string;
  institutions_id: string;
  is_active: boolean;
  board?: { board_code: string; board_name: string } | null;
}

interface CompositionDetail extends CompositionOption {
  members?: BosMember[];
}

// ── Schema ────────────────────────────────────────────────────────────────────

const meetingFormSchema = z.object({
  institutions_id: z.string().min(1),
  board_id: z.string().min(1, 'Board is required'),
  composition_id: z.string().min(1, 'Composition is required'),
  meeting_type: z.enum(['regular', 'special', 'emergency', 'online', 'hybrid']),
  academic_year: z.string().min(1, 'Academic year is required'),
  scheduled_date: z.string().min(1, 'Scheduled date is required'),
  scheduled_time: z.string().optional(),
  venue: z.string().optional(),
  agenda_text: z.string().optional(),
});

export type MeetingFormValues = z.infer<typeof meetingFormSchema>;

// ── Props ─────────────────────────────────────────────────────────────────────

interface MeetingFormProps {
  meeting?: BosMeeting;
  isSubmitting: boolean;
  onSubmit: (data: MeetingFormValues) => void;
  onCancel: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function deriveAcademicYear(dateStr: string): string {
  if (!dateStr) return '';
  const year = new Date(dateStr).getFullYear();
  return `${year}-${year + 1}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MeetingForm({ meeting, isSubmitting, onSubmit, onCancel }: MeetingFormProps) {
  const { isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const scope = useBosBoardScope();

  const [compositions, setCompositions] = useState<CompositionOption[]>([]);
  const [loadingCompositions, setLoadingCompositions] = useState(false);
  const [compositionDetail, setCompositionDetail] = useState<CompositionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [nextMeetingNumber, setNextMeetingNumber] = useState<number | null>(null);

  const form = useForm<MeetingFormValues>({
    resolver: zodResolver(meetingFormSchema),
    defaultValues: meeting
      ? {
          institutions_id: meeting.institutions_id,
          board_id: meeting.board_id,
          composition_id: meeting.composition_id,
          meeting_type: meeting.meeting_type,
          academic_year: meeting.academic_year,
          scheduled_date: meeting.scheduled_date ?? '',
          scheduled_time: meeting.scheduled_time ?? '',
          venue: meeting.venue ?? '',
          agenda_text: meeting.agenda_text ?? '',
        }
      : {
          institutions_id: '',
          board_id: '',
          composition_id: '',
          meeting_type: 'regular',
          academic_year: '',
          scheduled_date: '',
          scheduled_time: '',
          venue: '',
          agenda_text: '',
        },
  });

  const compositionId = form.watch('composition_id');
  const institutionsId = form.watch('institutions_id');
  const boardId = form.watch('board_id');
  const academicYear = form.watch('academic_year');

  const { data: academicYearsData } = useAcademicYears(institutionsId || undefined);
  const academicYears = academicYearsData?.data ?? [];
  const academicYearOptions = [
    ...academicYears.map((ay) => ({ value: ay.academic_year_name, label: ay.academic_year_name })),
    ...(meeting?.academic_year && !academicYears.some((ay) => ay.academic_year_name === meeting.academic_year)
      ? [{ value: meeting.academic_year, label: meeting.academic_year }]
      : []),
  ];

  // Compositions list — gated by scope.isChairmanIn for non-super-admins.
  // We fetch active compositions and then filter to the ones the user chairs.
  // Super-admin: gets every active composition.
  useEffect(() => {
    if (scope.isLoading) return;

    setLoadingCompositions(true);
    const params = new URLSearchParams();
    params.set('isActive', 'true');
    params.set('limit', '100');
    // Non-super-admin: institution scope is applied server-side automatically.
    // No need to pass institutionsId — the API derives it from the auth user.

    fetch(`/api/bos/compositions?${params.toString()}`)
      .then((r) => r.json())
      .then((res) => {
        const all: CompositionOption[] = (res?.data ?? []).map((c: any) => ({
          id: c.id,
          composition_title: c.composition_title,
          academic_year: c.academic_year,
          board_id: c.board_id,
          institutions_id: c.institutions_id,
          is_active: c.is_active,
          board: c.board ?? null,
        }));

        // Chairman-only filter (server already gates POST, but mirror it on the
        // dropdown so the chairman never sees comps where they're a regular member).
        // Edit mode is exempt — we always show the composition the meeting was
        // created against even if the user lost chairman status afterwards.
        let visible = all;
        if (!isSuperAdmin && !meeting) {
          visible = all.filter((c) => scope.isChairmanIn.has(c.id));
        }

        setCompositions(visible);

        // Auto-select when chairman has exactly one composition.
        if (!meeting && !form.getValues('composition_id') && visible.length === 1) {
          form.setValue('composition_id', visible[0].id);
        }
      })
      .catch((err) => {
        logger.error('academic/bos', 'Failed to fetch compositions', err);
        setCompositions([]);
      })
      .finally(() => setLoadingCompositions(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.isLoading, isSuperAdmin]);

  // Composition change → fetch full detail (members + board) and auto-fill
  // board_id, institutions_id, academic_year.
  useEffect(() => {
    if (!compositionId) {
      setCompositionDetail(null);
      return;
    }
    setLoadingDetail(true);
    fetch(`/api/bos/compositions/${compositionId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Composition fetch failed: ${r.status}`);
        return r.json();
      })
      .then((data: CompositionDetail) => {
        setCompositionDetail(data);
        // Auto-fill cascaded fields. Skip overriding edit-mode values that the
        // user may not have touched (form values are pre-loaded from meeting).
        form.setValue('board_id', data.board_id);
        form.setValue('institutions_id', data.institutions_id);
        if (!form.getValues('academic_year') && data.academic_year) {
          form.setValue('academic_year', data.academic_year);
        }
      })
      .catch((err) => {
        logger.error('academic/bos', 'Failed to fetch composition detail', err);
        setCompositionDetail(null);
      })
      .finally(() => setLoadingDetail(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compositionId]);

  // Fetch next meeting number once board + academic_year are derived.
  useEffect(() => {
    if (!boardId || !academicYear || meeting) return;
    BosMeetingService.getNextMeetingNumber(boardId, academicYear)
      .then(setNextMeetingNumber)
      .catch(() => setNextMeetingNumber(null));
  }, [boardId, academicYear, meeting]);

  // Pull the chairman row from the members list.
  const chairman = useMemo<BosMember | null>(() => {
    if (!compositionDetail?.members?.length) return null;
    return compositionDetail.members.find((m) => m.member_type === 'chairman' && m.is_active) ?? null;
  }, [compositionDetail]);

  const handleDateChange = (value: string) => {
    form.setValue('scheduled_date', value);
    if (value && !form.getValues('academic_year')) {
      const derived = deriveAcademicYear(value);
      const match = academicYearOptions.find((opt) => opt.value === derived);
      if (match) form.setValue('academic_year', match.value);
    }
  };

  if (permissionsLoading || scope.isLoading) {
    return (
      <div className='space-y-4'>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className='h-16 w-full' />
        ))}
      </div>
    );
  }

  const compositionOptions = compositions.map((c) => ({
    value: c.id,
    label: c.board?.board_name
      ? `${c.board.board_name} — ${c.composition_title} (${c.academic_year})`
      : `${c.composition_title} (${c.academic_year})`,
  }));

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>

        {/* Two-column layout on xl+: main form (2/3) | sticky chairman side panel (1/3). */}
        <div className='grid grid-cols-1 gap-6 xl:grid-cols-3'>

          {/* ── Main column ──────────────────────────────────────────── */}
          <div className='space-y-6 xl:col-span-2'>

            {/* Composition (primary selector) + auto-derived board */}
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Select Composition</CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='grid gap-4 md:grid-cols-2'>
                  <FormField
                    control={form.control}
                    name='composition_id'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Composition <span className='text-destructive'>*</span></FormLabel>
                        <SearchableSelect
                          value={field.value}
                          onValueChange={field.onChange}
                          options={compositionOptions}
                          placeholder={
                            loadingCompositions
                              ? 'Loading…'
                              : compositionOptions.length === 0
                                ? 'No compositions available'
                                : 'Select composition'
                          }
                          searchPlaceholder='Search composition…'
                          loading={loadingCompositions}
                          disabled={loadingCompositions || compositionOptions.length === 0}
                          className='w-full'
                        />
                        <FormDescription>
                          {isSuperAdmin
                            ? 'All active compositions are listed.'
                            : 'Only compositions where you serve as chairman are listed.'}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Auto-derived board summary — mirrors the form-field height. */}
                  <div>
                    <div className='mb-2 text-sm font-medium'>Board</div>
                    <div className='rounded-md border bg-muted/40 px-3 py-2 text-sm'>
                      {!compositionId ? (
                        <span className='text-muted-foreground'>Select a composition to view the board</span>
                      ) : loadingDetail ? (
                        <Skeleton className='h-4 w-40' />
                      ) : compositionDetail?.board ? (
                        <div className='flex flex-col'>
                          <span className='font-medium leading-tight'>{compositionDetail.board.board_name}</span>
                          <span className='text-xs text-muted-foreground'>{compositionDetail.board.board_code}</span>
                        </div>
                      ) : (
                        <span className='text-muted-foreground'>—</span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Meeting Identity */}
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Meeting Details</CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='grid gap-4 md:grid-cols-2'>
                  <FormField
                    control={form.control}
                    name='meeting_type'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Meeting Type <span className='text-destructive'>*</span></FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder='Select type' />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.entries(BOS_MEETING_TYPE_LABELS).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
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
                    name='academic_year'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Academic Year <span className='text-destructive'>*</span></FormLabel>
                        <SearchableSelect
                          value={field.value}
                          onValueChange={field.onChange}
                          options={academicYearOptions}
                          placeholder='Select academic year'
                          searchPlaceholder='Search year…'
                          disabled={!institutionsId}
                          className='w-full'
                        />
                        <FormDescription>Auto-selected from the composition; adjustable.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Schedule & Venue */}
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Schedule &amp; Venue</CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='grid gap-4 md:grid-cols-3'>
                  <FormField
                    control={form.control}
                    name='scheduled_date'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Scheduled Date <span className='text-destructive'>*</span></FormLabel>
                        <FormControl>
                          <Input
                            type='date'
                            {...field}
                            onChange={(e) => handleDateChange(e.target.value)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name='scheduled_time'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Time</FormLabel>
                        <FormControl>
                          <Input type='time' {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name='venue'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Venue</FormLabel>
                        <FormControl>
                          <Input placeholder='e.g. Principal Conference Hall' {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Agenda Overview */}
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Agenda Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name='agenda_text'
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea
                          placeholder='Brief agenda items for the notice (detailed agenda is added after saving)'
                          className='resize-y min-h-[140px]'
                          rows={6}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        This text appears on the meeting notice. Detailed agenda items are managed separately.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </div>

          {/* ── Sidebar (chairman + meeting summary) ─────────────────── */}
          <aside className='xl:col-span-1'>
            <div className='space-y-4 xl:sticky xl:top-6'>
              <Card>
                <CardHeader>
                  <CardTitle className='text-base'>Chairman Details</CardTitle>
                </CardHeader>
                <CardContent>
                  {!compositionId ? (
                    <div className='text-sm text-muted-foreground'>
                      Select a composition to view chairman information.
                    </div>
                  ) : loadingDetail ? (
                    <div className='space-y-2'>
                      <Skeleton className='h-4 w-40' />
                      <Skeleton className='h-4 w-56' />
                      <Skeleton className='h-4 w-48' />
                    </div>
                  ) : chairman ? (
                    <div className='flex gap-3'>
                      <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary'>
                        <UserCircle2 className='h-6 w-6' />
                      </div>
                      <div className='min-w-0 space-y-1 text-sm'>
                        <div className='font-medium leading-snug break-words'>{chairman.display_name}</div>
                        {chairman.display_designation && (
                          <div className='text-muted-foreground break-words'>{chairman.display_designation}</div>
                        )}
                        {chairman.display_institution && (
                          <div className='text-muted-foreground break-words'>{chairman.display_institution}</div>
                        )}
                        <div className='space-y-1 pt-1 text-muted-foreground'>
                          {chairman.email && (
                            <div className='inline-flex items-center gap-1.5 break-all'>
                              <Mail className='h-3.5 w-3.5 shrink-0' /> {chairman.email}
                            </div>
                          )}
                          {chairman.contact_no && (
                            <div className='inline-flex items-center gap-1.5'>
                              <Phone className='h-3.5 w-3.5 shrink-0' /> {chairman.contact_no}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className='text-sm text-muted-foreground'>
                      No active chairman found in <code className='rounded bg-muted px-1 text-xs'>bos_members</code> for
                      this composition. Add a chairman before scheduling a meeting.
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Meeting number preview — visible only on create when derivable. */}
              {nextMeetingNumber && !meeting && (
                <Card>
                  <CardContent className='space-y-2 p-4'>
                    <div className='text-xs uppercase tracking-wide text-muted-foreground'>
                      Meeting number
                    </div>
                    <Badge variant='secondary' className='text-sm'>
                      Meeting {nextMeetingNumber} of {academicYear || '–'}
                    </Badge>
                    <p className='text-xs text-muted-foreground'>Auto-assigned on save.</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </aside>
        </div>

        {/* ── Actions ───────────────────────────────────────────────── */}
        <div className='flex flex-col gap-3 border-t pt-4 sm:flex-row sm:justify-end'>
          <Button type='button' variant='outline' onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type='submit'
            disabled={isSubmitting || (!meeting && !chairman)}
            title={!meeting && !chairman ? 'Add a chairman to the composition first' : undefined}
          >
            {isSubmitting ? 'Saving...' : meeting ? 'Update Meeting' : 'Schedule Meeting'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
