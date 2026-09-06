'use client';

// =============================================================================
// RCLTP teacher — "Open assessment for class" console (Phase 4c)
// =============================================================================
// (a) Create/assign an assessment via useCreateRcltpAssessment:
//       institution → learner (learners_profiles) → approved passage → type →
//       (cycle_no when type=cycle) → grade. Lists existing assessments.
// (b) Schedule windows via useRcltpSchedule + create + confirm: the 6 cycles/year
//       (cycle_no, window_start/end, status proposed→confirmed).
//
// SAFETY: this surface only creates/schedules sittings and lists status — it never
// renders a score or band (those are MyJKKN-gated and shown honestly elsewhere).
// Only status='approved' passages are offered, mirroring the student serve path.
// =============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  Plus,
  ClipboardList,
  CalendarRange,
  Check,
  CalendarPlus,
} from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  useRcltpAssessments,
  useCreateRcltpAssessment,
} from '@/hooks/rcltp/use-rcltp-assessments';
import {
  useRcltpSchedule,
  useCreateRcltpScheduleWindow,
  useConfirmRcltpScheduleWindow,
} from '@/hooks/rcltp/use-rcltp-schedule';
import { useRcltpPassages } from '@/hooks/rcltp/use-rcltp-passages';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  RcltpAssessment,
  RcltpAssessmentStatus,
  RcltpAssessmentType,
  RcltpAssessmentSchedule,
  RcltpScheduleStatus,
} from '@/types/rcltp';

// The 6 assessment cycles per academic year (plus baseline + practice as types).
const CYCLE_NOS = [1, 2, 3, 4, 5, 6] as const;
const ASSESSMENT_TYPES: RcltpAssessmentType[] = ['baseline', 'cycle', 'practice'];

interface Institution {
  id: string;
  name: string;
}

interface Learner {
  id: string;
  first_name: string | null;
  last_name: string | null;
  roll_number: string | null;
}

interface AcademicYear {
  id: string;
  academic_year_name: string | null;
}

function learnerName(l: Learner): string {
  const full = `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim();
  const base = full || 'Unnamed learner';
  return l.roll_number ? `${base} (${l.roll_number})` : base;
}

// ---------------------------------------------------------------------------
// Lookups — institutions, learners (per institution), academic years.
// Columns verified against existing usages (student-search-service.ts uses
// learners_profiles.first_name/last_name/roll_number/institution_id;
// content-console.tsx uses institutions.id/name).
// ---------------------------------------------------------------------------
function useInstitutions() {
  return useQuery({
    queryKey: ['rcltp', 'institutions', 'active'],
    queryFn: async (): Promise<Institution[]> => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any)
        .from('institutions')
        .select('id, name')
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Institution[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

function useLearners(institutionId: string | null) {
  return useQuery({
    queryKey: ['rcltp', 'learners', institutionId],
    enabled: !!institutionId,
    queryFn: async (): Promise<Learner[]> => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any)
        .from('learners_profiles')
        .select('id, first_name, last_name, roll_number')
        .eq('institution_id', institutionId)
        .eq('lifecycle_status', 'active')
        .order('first_name', { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Learner[];
    },
    staleTime: 60 * 1000,
  });
}

function useAcademicYears(institutionId: string | null) {
  return useQuery({
    queryKey: ['rcltp', 'academic-years', institutionId],
    enabled: !!institutionId,
    queryFn: async (): Promise<AcademicYear[]> => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any)
        .from('academic_years')
        .select('id, academic_year_name')
        .eq('institution_id', institutionId)
        .order('academic_year_name', { ascending: false });
      if (error) throw error;
      return (data ?? []) as AcademicYear[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Status badges
// ---------------------------------------------------------------------------
function assessmentStatusBadge(status: RcltpAssessmentStatus) {
  if (status === 'published')
    return <Badge className='bg-emerald-100 text-emerald-800 hover:bg-emerald-100'>Published</Badge>;
  if (status === 'scored')
    return <Badge className='bg-emerald-100 text-emerald-800 hover:bg-emerald-100'>Scored</Badge>;
  if (status === 'needs_review')
    return <Badge className='bg-amber-100 text-amber-900 hover:bg-amber-100'>Needs review</Badge>;
  if (status === 'in_progress' || status === 'recorded' || status === 'queued_for_scoring')
    return <Badge variant='default'>{status.replace(/_/g, ' ')}</Badge>;
  if (status === 'not_attempted')
    return <Badge variant='secondary'>Not attempted</Badge>;
  return <Badge variant='outline'>{status.replace(/_/g, ' ')}</Badge>;
}

function scheduleStatusBadge(status: RcltpScheduleStatus) {
  if (status === 'confirmed')
    return <Badge className='bg-emerald-100 text-emerald-800 hover:bg-emerald-100'>Confirmed</Badge>;
  if (status === 'open')
    return <Badge variant='default'>Open</Badge>;
  if (status === 'closed')
    return <Badge variant='secondary'>Closed</Badge>;
  return <Badge className='bg-amber-100 text-amber-900 hover:bg-amber-100'>Proposed</Badge>;
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return d;
}

// ===========================================================================
// (a) Create/assign assessment dialog
// ===========================================================================
function CreateAssessmentDialog({
  open,
  onOpenChange,
  institutions,
  defaultInstitutionId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  institutions: Institution[];
  defaultInstitutionId: string;
}) {
  const createAssessment = useCreateRcltpAssessment();

  const [institutionId, setInstitutionId] = useState<string>('');
  const [learnerId, setLearnerId] = useState<string>('');
  const [passageId, setPassageId] = useState<string>('');
  const [assessmentType, setAssessmentType] = useState<RcltpAssessmentType>('baseline');
  const [cycleNo, setCycleNo] = useState<string>('1');
  const [grade, setGrade] = useState<string>('');
  const [academicYearId, setAcademicYearId] = useState<string>('');

  // Seed institution when opening.
  useEffect(() => {
    if (open) {
      setInstitutionId(defaultInstitutionId || '');
      setLearnerId('');
      setPassageId('');
      setAssessmentType('baseline');
      setCycleNo('1');
      setGrade('');
      setAcademicYearId('');
    }
  }, [open, defaultInstitutionId]);

  const learnersQuery = useLearners(institutionId || null);
  const learners = learnersQuery.data ?? [];

  // Academic years track the dialog's selected school (a cycle sitting ties to a
  // schedule window keyed on institution+year+cycle).
  const academicYearsQuery = useAcademicYears(institutionId || null);
  const academicYears = academicYearsQuery.data ?? [];

  // Only approved passages are offered — students may only ever see approved content.
  const passagesQuery = useRcltpPassages(
    institutionId
      ? {
          status: 'approved',
          institution_id: institutionId,
          ...(grade ? { grade_level: Number(grade) } : {}),
        }
      : {}
  );
  const passages = institutionId ? (passagesQuery.data?.data ?? []) : [];

  async function handleSave() {
    if (!institutionId) {
      toast.error('Select a school');
      return;
    }
    if (!learnerId) {
      toast.error('Select a learner');
      return;
    }
    try {
      await createAssessment.mutateAsync({
        institution_id: institutionId,
        learner_id: learnerId,
        passage_id: passageId || null,
        assessment_type: assessmentType,
        cycle_no: assessmentType === 'cycle' ? Number(cycleNo) : null,
        grade_level: grade ? Number(grade) : null,
        academic_year_id: academicYearId || null,
      });
      onOpenChange(false);
    } catch {
      /* hook surfaces the toast */
    }
  }

  const saving = createAssessment.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-2xl'>
        <DialogHeader>
          <DialogTitle>Open assessment for a learner</DialogTitle>
          <DialogDescription>
            Assign a reading assessment. The learner takes it from their portal;
            results only ever appear once validated — never an estimate.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div className='grid grid-cols-2 gap-3'>
            <div className='col-span-2'>
              <Label>School</Label>
              <Select
                value={institutionId}
                onValueChange={(v) => {
                  setInstitutionId(v);
                  setLearnerId('');
                  setPassageId('');
                  setAcademicYearId('');
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select school' />
                </SelectTrigger>
                <SelectContent>
                  {institutions.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className='col-span-2'>
              <Label>Learner</Label>
              <Select
                value={learnerId}
                onValueChange={setLearnerId}
                disabled={!institutionId || learnersQuery.isLoading}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !institutionId
                        ? 'Pick a school first'
                        : learnersQuery.isLoading
                          ? 'Loading learners…'
                          : learners.length === 0
                            ? 'No active learners in this school'
                            : 'Select learner'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {learners.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {learnerName(l)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className='col-span-2'>
              <Label>Academic year</Label>
              <Select
                value={academicYearId}
                onValueChange={setAcademicYearId}
                disabled={!institutionId || academicYearsQuery.isLoading}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !institutionId
                        ? 'Pick a school first'
                        : academicYearsQuery.isLoading
                          ? 'Loading years…'
                          : academicYears.length === 0
                            ? 'No academic years in this school'
                            : 'Select academic year'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {academicYears.map((y) => (
                    <SelectItem key={y.id} value={y.id}>
                      {y.academic_year_name ?? y.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Assessment type</Label>
              <Select
                value={assessmentType}
                onValueChange={(v) => setAssessmentType(v as RcltpAssessmentType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSESSMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {assessmentType === 'cycle' && (
              <div>
                <Label>Cycle number</Label>
                <Select value={cycleNo} onValueChange={setCycleNo}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CYCLE_NOS.map((c) => (
                      <SelectItem key={c} value={String(c)}>
                        Cycle {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label htmlFor='a-grade'>Grade level</Label>
              <Input
                id='a-grade'
                type='number'
                min={1}
                max={12}
                value={grade}
                onChange={(e) => {
                  setGrade(e.target.value);
                  setPassageId('');
                }}
                placeholder='e.g. 5'
              />
            </div>

            <div className={assessmentType === 'cycle' ? 'col-span-2' : ''}>
              <Label>Passage (approved only)</Label>
              <Select
                value={passageId}
                onValueChange={setPassageId}
                disabled={!institutionId || passagesQuery.isLoading}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !institutionId
                        ? 'Pick a school first'
                        : passagesQuery.isLoading
                          ? 'Loading passages…'
                          : passages.length === 0
                            ? 'No approved passages for this filter'
                            : 'Select passage (optional)'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {passages.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title}
                      {p.grade_level != null ? ` · Grade ${p.grade_level}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className='mt-1 text-xs text-muted-foreground'>
                Only approved passages appear. Leave blank to let the system serve
                the next unseen passage when the learner starts.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Opening…' : 'Open assessment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===========================================================================
// (b) Schedule-window create dialog
// ===========================================================================
function ScheduleDialog({
  open,
  onOpenChange,
  institutionId,
  academicYears,
  academicYearsLoading,
  existingCycleNos,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  institutionId: string;
  academicYears: AcademicYear[];
  academicYearsLoading: boolean;
  existingCycleNos: Set<number>;
}) {
  const createWindow = useCreateRcltpScheduleWindow();

  const [academicYearId, setAcademicYearId] = useState<string>('');
  const [cycleNo, setCycleNo] = useState<string>('1');
  const [windowStart, setWindowStart] = useState<string>('');
  const [windowEnd, setWindowEnd] = useState<string>('');

  useEffect(() => {
    if (open) {
      setAcademicYearId('');
      const firstFree = CYCLE_NOS.find((c) => !existingCycleNos.has(c)) ?? 1;
      setCycleNo(String(firstFree));
      setWindowStart('');
      setWindowEnd('');
    }
  }, [open, existingCycleNos]);

  async function handleSave() {
    if (!academicYearId) {
      toast.error('Select an academic year');
      return;
    }
    if (windowStart && windowEnd && windowEnd < windowStart) {
      toast.error('End date must be on or after the start date');
      return;
    }
    try {
      await createWindow.mutateAsync({
        institution_id: institutionId,
        academic_year_id: academicYearId,
        cycle_no: Number(cycleNo),
        window_start: windowStart || null,
        window_end: windowEnd || null,
        // Teacher-created windows are a manual proposal awaiting confirmation.
        status: 'proposed',
        proposed_by_system: false,
      });
      onOpenChange(false);
    } catch {
      /* hook surfaces the toast */
    }
  }

  const saving = createWindow.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a cycle window</DialogTitle>
          <DialogDescription>
            Propose a window for one of the 6 yearly cycles. It starts as
            <strong> proposed</strong>; confirm it once the dates are final.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div>
            <Label>Academic year</Label>
            <Select
              value={academicYearId}
              onValueChange={setAcademicYearId}
              disabled={academicYearsLoading}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    academicYearsLoading
                      ? 'Loading years…'
                      : academicYears.length === 0
                        ? 'No academic years for this school'
                        : 'Select academic year'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {academicYears.map((y) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.academic_year_name ?? y.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Cycle</Label>
            <Select value={cycleNo} onValueChange={setCycleNo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CYCLE_NOS.map((c) => (
                  <SelectItem key={c} value={String(c)} disabled={existingCycleNos.has(c)}>
                    Cycle {c}
                    {existingCycleNos.has(c) ? ' (already scheduled)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
            <div>
              <Label htmlFor='w-start'>Window start</Label>
              <Input
                id='w-start'
                type='date'
                value={windowStart}
                onChange={(e) => setWindowStart(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor='w-end'>Window end</Label>
              <Input
                id='w-end'
                type='date'
                value={windowEnd}
                onChange={(e) => setWindowEnd(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Adding…' : 'Add window'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===========================================================================
// Main console
// ===========================================================================
export function AssessmentsConsole() {
  const { data: institutions = [] } = useInstitutions();
  const [instFilter, setInstFilter] = useState<string>('');

  // Default the filter to the first institution once loaded.
  useEffect(() => {
    if (!instFilter && institutions.length > 0) {
      setInstFilter(institutions[0].id);
    }
  }, [institutions, instFilter]);

  const assessmentsQuery = useRcltpAssessments(
    instFilter ? { institution_id: instFilter } : {}
  );
  const assessments = instFilter ? (assessmentsQuery.data?.data ?? []) : [];

  const scheduleQuery = useRcltpSchedule(
    instFilter ? { institution_id: instFilter } : {}
  );
  const windows = instFilter ? (scheduleQuery.data?.data ?? []) : [];

  const academicYearsQuery = useAcademicYears(instFilter || null);

  const confirmWindow = useConfirmRcltpScheduleWindow();

  const [createOpen, setCreateOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const instName = useMemo(() => {
    const m = new Map(institutions.map((i) => [i.id, i.name]));
    return (id: string) => m.get(id) ?? 'School';
  }, [institutions]);

  const existingCycleNos = useMemo(
    () => new Set(windows.map((w) => w.cycle_no)),
    [windows]
  );

  async function confirm(w: RcltpAssessmentSchedule) {
    const supabase = createClientSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      toast.error('Could not identify you — please sign in again.');
      return;
    }
    confirmWindow.mutate({ id: w.id, confirmedBy: user.id });
  }

  return (
    <div className='space-y-8'>
      {/* School scope */}
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h2 className='text-lg font-semibold'>School</h2>
          <p className='text-sm text-muted-foreground'>
            Pick the school you’re working with. Learners, passages, assessments,
            and cycle windows are all scoped to it.
          </p>
        </div>
        <Select value={instFilter} onValueChange={setInstFilter}>
          <SelectTrigger className='w-full sm:w-64'>
            <SelectValue placeholder='Select school' />
          </SelectTrigger>
          <SelectContent>
            {institutions.map((i) => (
              <SelectItem key={i.id} value={i.id}>
                {i.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* (a) Assessments */}
      <section className='space-y-4'>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <h2 className='text-lg font-semibold'>Assessments</h2>
            <p className='text-sm text-muted-foreground'>
              Open a reading assessment for a learner and track its status.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} disabled={!instFilter}>
            <Plus className='mr-2 h-4 w-4' /> Open assessment
          </Button>
        </div>

        {!instFilter ? (
          <div className='rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground'>
            Select a school to see its assessments.
          </div>
        ) : assessmentsQuery.isLoading ? (
          <Skeleton className='h-48 w-full' />
        ) : assessments.length === 0 ? (
          <div className='rounded-md border border-dashed p-10 text-center'>
            <ClipboardList className='mx-auto mb-2 h-8 w-8 text-muted-foreground' />
            <p className='text-sm text-muted-foreground'>
              No assessments yet for {instName(instFilter)}. Open one to get started.
            </p>
          </div>
        ) : (
          <div className='rounded-md border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Cycle</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Attempt</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assessments.map((a: RcltpAssessment) => (
                  <TableRow key={a.id}>
                    <TableCell className='font-medium capitalize'>
                      {a.assessment_type}
                    </TableCell>
                    <TableCell>{a.cycle_no ?? '—'}</TableCell>
                    <TableCell>{a.grade_level ?? '—'}</TableCell>
                    <TableCell>{a.attempt_no}</TableCell>
                    <TableCell>{assessmentStatusBadge(a.status)}</TableCell>
                    <TableCell className='text-sm text-muted-foreground'>
                      {new Date(a.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <Separator />

      {/* (b) Schedule windows */}
      <section className='space-y-4'>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <h2 className='text-lg font-semibold'>Assessment windows</h2>
            <p className='text-sm text-muted-foreground'>
              The 6 cycles per academic year. The system can propose windows; you
              confirm the final dates.
            </p>
          </div>
          <Button
            variant='outline'
            onClick={() => setScheduleOpen(true)}
            disabled={!instFilter}
          >
            <CalendarPlus className='mr-2 h-4 w-4' /> Add window
          </Button>
        </div>

        {!instFilter ? (
          <div className='rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground'>
            Select a school to see its cycle windows.
          </div>
        ) : scheduleQuery.isLoading ? (
          <Skeleton className='h-40 w-full' />
        ) : windows.length === 0 ? (
          <div className='rounded-md border border-dashed p-10 text-center'>
            <CalendarRange className='mx-auto mb-2 h-8 w-8 text-muted-foreground' />
            <p className='text-sm text-muted-foreground'>
              No cycle windows scheduled yet. Add one to define when a cycle opens.
            </p>
          </div>
        ) : (
          <div className='rounded-md border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cycle</TableHead>
                  <TableHead>Window start</TableHead>
                  <TableHead>Window end</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className='text-right'>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {windows.map((w: RcltpAssessmentSchedule) => (
                  <TableRow key={w.id}>
                    <TableCell className='font-medium'>Cycle {w.cycle_no}</TableCell>
                    <TableCell>{fmtDate(w.window_start)}</TableCell>
                    <TableCell>{fmtDate(w.window_end)}</TableCell>
                    <TableCell>{scheduleStatusBadge(w.status)}</TableCell>
                    <TableCell className='text-right'>
                      {w.status === 'proposed' && (
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={() => confirm(w)}
                          disabled={confirmWindow.isPending}
                        >
                          <Check className='mr-1 h-3.5 w-3.5' /> Confirm
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* MyJKKN-honest note */}
      <Card className='border-dashed'>
        <CardHeader>
          <CardTitle className='text-sm'>Scoring &amp; reports</CardTitle>
          <CardDescription>
            Reading bands and detailed reports appear only after a sitting is
            validated. Auto voice-scoring is pending (MyJKKN), so no score or band
            is shown here — only the assessment’s lifecycle status.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>

      <CreateAssessmentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        institutions={institutions}
        defaultInstitutionId={instFilter}
      />
      <ScheduleDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        institutionId={instFilter}
        academicYears={academicYearsQuery.data ?? []}
        academicYearsLoading={academicYearsQuery.isLoading}
        existingCycleNos={existingCycleNos}
      />
    </div>
  );
}
