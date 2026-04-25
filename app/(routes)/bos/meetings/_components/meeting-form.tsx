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
import { Badge } from '@/components/ui/badge';

import { BosMeeting, BOS_MEETING_TYPE_LABELS } from '@/types/bos';
import { usePermissions } from '@/hooks/use-permissions';
import { BosMeetingService } from '@/lib/services/bos/bos-meeting-service';
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

interface CompositionOption {
  id: string;
  composition_title: string;
  academic_year: string;
  is_active: boolean;
}

// ── Schema ────────────────────────────────────────────────────────────────────

const meetingFormSchema = z.object({
  institutions_id: z.string().min(1),
  board_id: z.string().min(1, 'Board is required'),
  composition_id: z.string().min(1, 'Composition is required'),
  meeting_type: z.enum(['regular', 'special', 'emergency', 'online']),
  academic_year: z
    .string()
    .regex(/^\d{4}-\d{4}$/, 'Format: YYYY-YYYY')
    .min(1, 'Academic year is required'),
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
  const { userProfile, isSuperAdmin, isLoading: permissionsLoading } = usePermissions();

  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [compositions, setCompositions] = useState<CompositionOption[]>([]);
  const [loadingCompositions, setLoadingCompositions] = useState(false);
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

  // Watch cascade keys
  const institutionsId = form.watch('institutions_id');
  const boardId = form.watch('board_id');
  const academicYear = form.watch('academic_year');

  // Fetch institutions from COE database (for super admin dropdown)
  useEffect(() => {
    fetch('/api/bos/institutions')
      .then((r) => r.json())
      .then((list: Institution[]) => {
        setInstitutions(Array.isArray(list) ? list : []);
        // Non-admin: auto-select the single institution returned
        if (!meeting && !isSuperAdmin && Array.isArray(list) && list.length === 1) {
          form.setValue('institutions_id', list[0].id);
        }
      })
      .catch((err) => logger.error('academic/bos', 'Failed to fetch institutions', err));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fast path: set institution from profile immediately (non-admin only)
  useEffect(() => {
    if (!meeting && !isSuperAdmin && userProfile?.institution_id) {
      form.setValue('institutions_id', userProfile.institution_id);
    }
  }, [userProfile, meeting, isSuperAdmin, form]);

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

    // Reset downstream when institution changes (edit mode: skip)
    if (!meeting) {
      form.setValue('board_id', '');
      form.setValue('composition_id', '');
      setCompositions([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [institutionsId]);

  // Fetch compositions when board changes
  useEffect(() => {
    if (!boardId || !institutionsId) {
      setCompositions([]);
      return;
    }
    setLoadingCompositions(true);
    fetch(
      `/api/bos/compositions?boardId=${boardId}&institutionsId=${institutionsId}&isActive=true&limit=50`
    )
      .then((r) => r.json())
      .then((res) => setCompositions(res.data ?? []))
      .catch((err) => logger.error('academic/bos', 'Failed to fetch compositions', err))
      .finally(() => setLoadingCompositions(false));

    // Reset composition selection on board change
    if (!meeting) form.setValue('composition_id', '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, institutionsId]);

  // Fetch next meeting number
  useEffect(() => {
    if (!boardId || !academicYear || meeting) return;
    BosMeetingService.getNextMeetingNumber(boardId, academicYear)
      .then(setNextMeetingNumber)
      .catch(() => setNextMeetingNumber(null));
  }, [boardId, academicYear, meeting]);

  // Auto-derive academic year from scheduled date
  const handleDateChange = (value: string) => {
    form.setValue('scheduled_date', value);
    if (value && !form.getValues('academic_year')) {
      form.setValue('academic_year', deriveAcademicYear(value));
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

        {/* ── Meeting Identity ──────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Meeting Details</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid gap-4 md:grid-cols-2'>
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
                            : loadingBoards ? 'Loading...'
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
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Composition */}
              <FormField
                control={form.control}
                name='composition_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Composition <span className='text-destructive'>*</span></FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={!boardId || loadingCompositions}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              !boardId
                                ? 'Select a board first'
                                : loadingCompositions
                                ? 'Loading...'
                                : 'Select composition'
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {compositions.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.composition_title} ({c.academic_year})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Only active compositions are listed.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className='grid gap-4 md:grid-cols-2'>
              {/* Meeting Type */}
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

              {/* Academic Year */}
              <FormField
                control={form.control}
                name='academic_year'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Academic Year <span className='text-destructive'>*</span></FormLabel>
                    <FormControl>
                      <Input placeholder='e.g. 2025-2026' {...field} />
                    </FormControl>
                    <FormDescription>Auto-filled from scheduled date.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Auto meeting number preview */}
            {nextMeetingNumber && !meeting && (
              <div className='flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm'>
                <span className='text-muted-foreground'>Meeting number:</span>
                <Badge variant='secondary'>
                  Meeting {nextMeetingNumber} of {academicYear || '–'}
                </Badge>
                <span className='text-xs text-muted-foreground'>(auto-assigned on save)</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Schedule & Venue ─────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Schedule &amp; Venue</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid gap-4 md:grid-cols-3'>
              {/* Date */}
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

              {/* Time */}
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

              {/* Venue */}
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

        {/* ── Agenda Overview ───────────────────────────────────────────── */}
        <Card>
          <CardContent className='p-6'>
            <FormField
              control={form.control}
              name='agenda_text'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Agenda Overview</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='Brief agenda items for the notice (detailed agenda is added after saving)'
                      className='resize-none'
                      rows={4}
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

        {/* ── Actions ───────────────────────────────────────────────────── */}
        <div className='flex justify-end gap-3'>
          <Button type='button' variant='outline' onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type='submit' disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : meeting ? 'Update Meeting' : 'Schedule Meeting'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
