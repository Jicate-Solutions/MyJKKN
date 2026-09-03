'use client';

// Induction detail — the cohort engine: auto-enroll the joining cohort, then
// auto-split into batches by department. Live counts form the funnel. Actions
// call the SECURITY DEFINER RPCs via InductionService.
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { InductionService, type PreviewEnrollResult } from '@/lib/services/induction/induction-service';
import { INDUCTION_ACTIVE_STATUS } from '@/types/events';
import { SessionsSection } from './_components/sessions-section';
import { EventCoordinatorsSection } from './_components/event-coordinators-section';
import { EventFeedbackLinkCard } from '@/components/events/feedback/event-feedback-link-card';
import { FeedbackVolunteersSection } from './_components/feedback-volunteers-section';
import { FeedbackByCollegeSection } from './_components/feedback-by-college-section';
import { SessionFeedbackSection } from './_components/session-feedback-section';
import { ScorecardSection } from './_components/scorecard-section';
import { LoopPlaybookSection } from './_components/loop-playbook-section';
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Users, Layers, Building2, CalendarDays, UserPlus, Split, GraduationCap, MapPin, Rocket, AlertTriangle, ClipboardList, BookOpen, Network } from 'lucide-react';
import type { ComponentType } from 'react';

interface EventRow {
  id: string; name: string; status: string | null;
  start_date: string | null; end_date: string | null;
  institution_id: string; institutions?: { name: string } | null;
  venue_text?: string | null; venue_resource_id?: string | null;
}
interface BatchCount { id: string; label: string; count: number; }

const supabase = createClientSupabaseClient();

export default function InductionDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [event, setEvent] = useState<EventRow | null>(null);
  const [hasProgram, setHasProgram] = useState(false);
  const [academicYearId, setAcademicYearId] = useState<string | null>(null);
  const [admissionYear, setAdmissionYear] = useState<number | null>(null);
  const [enrollScope, setEnrollScope] = useState<string | null>(null);
  const [degreeFilter, setDegreeFilter] = useState<string | null>(null);
  const [targetInstitutionIds, setTargetInstitutionIds] = useState<string[] | null>(null);
  const [targetDegreeIds, setTargetDegreeIds] = useState<string[] | null>(null);
  const [targetDepartmentIds, setTargetDepartmentIds] = useState<string[] | null>(null);
  // Names behind the target_*_ids arrays — the program row stores IDs only.
  const [degreeNames, setDegreeNames] = useState<string[]>([]);
  const [departmentNames, setDepartmentNames] = useState<string[]>([]);
  const [venueName, setVenueName] = useState<string | null>(null);
  const [enrolled, setEnrolled] = useState(0);
  const [batches, setBatches] = useState<BatchCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  // Preview-before-enroll confirm gate (the actual enroll INSERT).
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewEnrollResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [numBatches, setNumBatches] = useState(2);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: ev }, { data: prog }, { count }, { data: batchRows }] = await Promise.all([
      supabase.from('events').select('id,name,status,start_date,end_date,institution_id,venue_text,venue_resource_id,institutions(name)').eq('id', id).maybeSingle(),
      supabase.from('induction_programs').select('event_id, academic_year_id, admission_year, enroll_scope, degree_type_filter, target_institution_ids, target_degree_ids, target_department_ids').eq('event_id', id).maybeSingle(),
      supabase.from('induction_enrollment').select('id', { count: 'exact', head: true }).eq('event_id', id),
      supabase.from('induction_batches').select('id,label').eq('event_id', id).order('label'),
    ]);
    setEvent((ev as any) ?? null);
    setHasProgram(!!prog);
    setAcademicYearId((prog as any)?.academic_year_id ?? null);
    setAdmissionYear((prog as any)?.admission_year ?? null);
    setEnrollScope((prog as any)?.enroll_scope ?? null);
    setDegreeFilter((prog as any)?.degree_type_filter ?? null);
    setTargetInstitutionIds((prog as any)?.target_institution_ids ?? null);
    setTargetDegreeIds((prog as any)?.target_degree_ids ?? null);
    setTargetDepartmentIds((prog as any)?.target_department_ids ?? null);
    setEnrolled(count ?? 0);

    // Resolve the degree/department scope to names so the header can show what
    // was actually picked at create time (empty array = no filter = "all").
    const degIds = ((prog as any)?.target_degree_ids as string[] | null) ?? [];
    const deptIds = ((prog as any)?.target_department_ids as string[] | null) ?? [];
    const [degRes, deptRes] = await Promise.all([
      degIds.length
        ? supabase.from('degrees').select('degree_name').in('id', degIds).order('degree_name')
        : Promise.resolve({ data: [] as any[] }),
      deptIds.length
        ? supabase.from('departments').select('department_name').in('id', deptIds).order('department_name')
        : Promise.resolve({ data: [] as any[] }),
    ]);
    setDegreeNames(((degRes.data as any[]) ?? []).map((d) => d.degree_name).filter(Boolean));
    setDepartmentNames(((deptRes.data as any[]) ?? []).map((d) => d.department_name).filter(Boolean));

    // Resolve the main venue — a Resource-Management room (preferred) or custom text.
    const vrid = (ev as any)?.venue_resource_id ?? null;
    if (vrid) {
      const { data: room } = await supabase.from('resources').select('name').eq('id', vrid).maybeSingle();
      setVenueName((room as any)?.name ?? (ev as any)?.venue_text ?? null);
    } else {
      setVenueName((ev as any)?.venue_text ?? null);
    }

    const bs = (batchRows as any[]) ?? [];
    const withCounts = await Promise.all(bs.map(async (b) => {
      const { count: c } = await supabase
        .from('induction_enrollment')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', id).eq('batch_id', b.id);
      return { id: b.id, label: b.label, count: c ?? 0 };
    }));
    setBatches(withCounts);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Step 1 — open the confirm gate and fetch the preview of who WOULD be enrolled.
  const handleEnroll = async () => {
    if (!event || admissionYear == null) {
      toast.error('Induction has no admission year set — cannot enroll.');
      return;
    }
    setConfirmOpen(true);
    setPreview(null);
    setPreviewing(true);
    try {
      const isMulti = (targetInstitutionIds?.length ?? 0) > 0;
      const res = await InductionService.previewEnroll(
        isMulti
          ? { admissionYear, institutionIds: targetInstitutionIds!, degreeIds: targetDegreeIds ?? undefined, departmentIds: targetDepartmentIds ?? undefined }
          : { institutionId: event.institution_id, admissionYear, enrollScope: (enrollScope as 'institution' | 'group') ?? 'institution', degreeTypeFilter: (degreeFilter as 'ug' | 'pg' | null) ?? null }
      );
      setPreview(res);
    } catch (e: any) {
      toast.error(`Couldn't load preview: ${e.message ?? e}`);
    } finally {
      setPreviewing(false);
    }
  };

  // Step 2 — confirmed: run the actual auto-enroll INSERT.
  const confirmEnroll = async () => {
    setConfirmOpen(false);
    setEnrolling(true);
    try {
      const n = await InductionService.autoEnroll(id);
      toast.success(n > 0 ? `Enrolled ${n} fresher${n === 1 ? '' : 's'}.` : 'No new freshers to enroll.');
      await load();
    } catch (e: any) {
      toast.error(`Couldn't enroll: ${e.message ?? e}`);
    } finally { setEnrolling(false); }
  };

  const handleSplit = async () => {
    setSplitting(true);
    try {
      const n = await InductionService.autoSplitBatches(id, numBatches);
      toast.success(`Assigned ${n} fresher${n === 1 ? '' : 's'} across ${numBatches} batches.`);
      await load();
    } catch (e: any) {
      toast.error(`Couldn't split batches: ${e.message ?? e}`);
    } finally { setSplitting(false); }
  };

  if (loading) {
    return (
      <ContentLayout title="Induction">
        <p className="text-sm text-muted-foreground mt-4">Loading…</p>
      </ContentLayout>
    );
  }
  if (!event) {
    return (
      <ContentLayout title="Induction">
        <PageBreadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Events', href: '/events' }, { label: 'Induction', href: '/events/induction' }, { label: 'Not found' }]} />
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Induction not found</CardTitle>
            <CardDescription>It may have been removed, or you don&apos;t have access to it.</CardDescription>
          </CardHeader>
        </Card>
      </ContentLayout>
    );
  }

  const assigned = batches.reduce((s, b) => s + b.count, 0);
  const unbatched = Math.max(0, enrolled - assigned);
  const dateRange = event.start_date
    ? `${new Date(event.start_date).toLocaleDateString()}${event.end_date ? ` – ${new Date(event.end_date).toLocaleDateString()}` : ''}`
    : null;
  const isMultiTarget = (targetInstitutionIds?.length ?? 0) > 0;
  const scopeLabel = isMultiTarget
    ? `${targetInstitutionIds!.length} college${targetInstitutionIds!.length === 1 ? '' : 's'} targeted`
    : enrollScope === 'group' ? 'All colleges (group)'
    : enrollScope === 'institution' ? 'This college only' : null;

  // Degree / department scope. These are optional at create time, but the header
  // still states them so the scope of the cohort is never left to guesswork:
  // nothing picked = no filter = every degree/department of the target colleges.
  // The count fallbacks cover IDs whose name row is unreadable (deleted / RLS).
  const degreesLabel = !hasProgram ? null
    : degreeNames.length ? degreeNames.join(', ')
    : targetDegreeIds?.length ? `${targetDegreeIds.length} selected`
    : degreeFilter === 'ug' ? 'All UG degrees'
    : degreeFilter === 'pg' ? 'All PG degrees'
    : 'All degrees';
  const departmentsLabel = !hasProgram ? null
    : departmentNames.length ? departmentNames.join(', ')
    : targetDepartmentIds?.length ? `${targetDepartmentIds.length} selected`
    : 'All departments';

  return (
    <ContentLayout title={event.name}>
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Events', href: '/events' },
        { label: 'Induction', href: '/events/induction' },
        { label: event.name },
      ]} />

      <div className="space-y-6 mt-4">
        {/* Program header — identity + at-a-glance meta */}
        <section className="rounded-xl border bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Rocket className="h-3.5 w-3.5 text-primary" aria-hidden /> Fresher Induction
              </div>
              <h1 className="text-2xl font-bold leading-tight">{event.name}</h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {/* Report console — attendance + feedback, day-wise / session-wise */}
              <Button asChild size="sm" variant="outline" className="gap-1">
                <Link href={`/events/induction/${id}/report`}>
                  <ClipboardList className="h-4 w-4" aria-hidden /> Report
                </Link>
              </Button>
              <Badge variant={event.status === 'live' ? 'default' : 'secondary'} className="capitalize">
                {event.status ?? 'draft'}
              </Badge>
            </div>
          </div>

          <div className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Every field renders, blank or not — a hidden row reads as "not applicable"
                when it really means "not set", which hides the true enrollment scope. */}
            <MetaItem icon={Building2} label="Institution" value={event.institutions?.name} />
            <MetaItem icon={CalendarDays} label="Dates" value={dateRange} />
            <MetaItem icon={GraduationCap} label="Admission year" value={admissionYear} />
            <MetaItem icon={Users} label="Enrollment" value={scopeLabel} />
            <MetaItem icon={BookOpen} label="Degrees" value={degreesLabel} />
            <MetaItem icon={Network} label="Departments" value={departmentsLabel} />
            <MetaItem icon={MapPin} label="Main venue" value={venueName} />
          </div>
        </section>

        {/* Per-event coordinators — appoint who runs THIS induction, independent of any institution-wide coordinator */}
        <EventCoordinatorsSection eventId={id} />

        {/* Custom feedback questionnaires.
            Deliberately ADDITIVE to the existing day/programme feedback below,
            which is a fixed rating-plus-comment shape (event_day_feedback /
            event_program_feedback) that a coordinator cannot reword. This card
            is for questions they write themselves. The two are stored
            separately and neither replaces the other. */}
        <EventFeedbackLinkCard eventId={id} />

        {/* KPI strip — cohort at a glance */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard icon={Users} label="Enrolled freshers" value={enrolled} />
          <StatCard icon={Layers} label="Batched" value={assigned} />
          <StatCard icon={Layers} label="Unbatched" value={unbatched} muted={unbatched === 0} />
          <StatCard icon={Layers} label="Batches" value={batches.length} />
        </div>

        {/* Cohort engine — enroll then split */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cohort engine</CardTitle>
            <CardDescription>
              {admissionYear
                ? `Auto-enroll adds reserved, admitted & account learners of admission year ${admissionYear}${isMultiTarget ? ` across ${targetInstitutionIds!.length} targeted colleges` : enrollScope === 'group' ? ' across all colleges' : ' in this college'}, then split them into batches by department (classmates stay together).`
                : 'Enroll the joining cohort, then split them into batches by department (classmates stay together).'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              {/* Enroll */}
              <div className="flex flex-col gap-3 rounded-lg border p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <UserPlus className="h-4 w-4 text-primary" aria-hidden /> Enroll freshers
                </div>
                <p className="text-xs text-muted-foreground">
                  Pulls the joining cohort into this induction. Safe to re-run — it only adds new learners.
                </p>
                <Button size="sm" className="mt-auto w-fit" onClick={handleEnroll} disabled={enrolling}>
                  <UserPlus className="h-4 w-4 mr-1" aria-hidden />
                  {enrolling ? 'Enrolling…' : enrolled > 0 ? 'Re-run auto-enroll' : 'Auto-enroll freshers'}
                </Button>
              </div>

              {/* Split */}
              <div className="flex flex-col gap-3 rounded-lg border p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Split className="h-4 w-4 text-primary" aria-hidden /> Split into batches
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="numb" className="text-xs text-muted-foreground">Count</Label>
                    <Input id="numb" type="number" min={1} max={12} value={numBatches}
                      onChange={(e) => setNumBatches(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
                      className="h-8 w-16" />
                  </div>
                </div>
                {batches.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {enrolled === 0 ? 'Enroll freshers first, then split into batches.' : 'Not split yet.'}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {batches.map((b) => (
                      <div key={b.id} className="rounded-md bg-muted px-3 py-1.5 min-w-[72px] transition-colors hover:bg-muted/70">
                        <div className="text-[11px] text-muted-foreground">Batch {b.label}</div>
                        <div className="text-base font-semibold tabular-nums">{b.count}</div>
                      </div>
                    ))}
                  </div>
                )}
                <Button size="sm" variant="outline" className="mt-auto w-fit" onClick={handleSplit} disabled={splitting || enrolled === 0}>
                  <Split className="h-4 w-4 mr-1" aria-hidden />
                  {splitting ? 'Splitting…' : 'Auto-split'}
                </Button>
              </div>
            </div>
            {!hasProgram && (
              <p className="text-xs text-amber-600">
                This event has no induction config row — enroll/split may not work. Recreate it from the Induction page.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Day-by-day schedule editor */}
        <SessionsSection
          eventId={id}
          batches={batches.map((b) => ({ id: b.id, label: b.label }))}
          // Only 'live' opens attendance/feedback — a legacy status is not Live.
          // Server-enforced by fn_induction_assert_live; this just mirrors it.
          isLive={event.status === INDUCTION_ACTIVE_STATUS}
        />

        {/* Peer-mentor feedback scale layer — appoint mentors, auto-balance, coverage */}
        <FeedbackVolunteersSection eventId={id} />

        {/* Each college's own read on a session — split by the fresher's college (D5) */}
        <FeedbackByCollegeSection eventId={id} />

        {/* Individual responses behind those averages — who said what, + XLSX export */}
        <SessionFeedbackSection eventId={id} eventName={event?.name ?? null} />

        {/* Value → advocacy → referral → JOIN funnel + NAAC evidence */}
        <ScorecardSection eventId={id} />

        {/* Self-improving loop playbook + adoption-verdict (counterfactual) control */}
        <LoopPlaybookSection institutionId={event?.institution_id ?? null} academicYearId={academicYearId} />
      </div>

      {/* Preview-before-enroll confirm gate — shows exactly who will be enrolled
          (count + per-program/per-college breakdown) before the INSERT runs. */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm who gets enrolled</AlertDialogTitle>
            <AlertDialogDescription>
              {enrolled > 0
                ? 'Re-running auto-enroll adds any new matching freshers (existing ones are kept). Review the matched set before continuing.'
                : 'Review the matched freshers before enrolling. The breakdown below should match who you intend to enroll.'}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            {previewing && (
              <div className="text-muted-foreground">Loading preview…</div>
            )}
            {!previewing && preview && (
              <div className="space-y-2">
                <div className={`font-semibold ${preview.total === 0 ? 'text-destructive flex items-center gap-1.5' : ''}`}>
                  {preview.total === 0 && <AlertTriangle className="h-4 w-4" />}
                  {preview.total} learner{preview.total === 1 ? '' : 's'}{' '}match this induction&apos;s scope
                  {degreeFilter ? ` (${degreeFilter.toUpperCase()} only)` : ''}
                </div>
                {preview.by_program.length > 0 && (
                  <ul className="grid grid-cols-1 gap-y-0.5 text-xs max-h-56 overflow-auto">
                    {preview.by_program.map((p, i) => (
                      <li key={i} className="flex justify-between gap-2 tabular-nums">
                        <span className="truncate">{p.program} <span className="uppercase text-muted-foreground">[{p.degree_type ?? '—'}]</span></span>
                        <span className="font-medium">{p.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {preview.by_institution.length > 1 && (
                  <div className="text-xs border-t pt-1.5">
                    <div className="text-muted-foreground mb-0.5">Across colleges:</div>
                    <ul className="space-y-0.5">
                      {preview.by_institution.map((i, idx) => (
                        <li key={idx} className="flex justify-between gap-2 tabular-nums">
                          <span className="truncate">{i.institution}</span><span className="font-medium">{i.count}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={enrolling}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmEnroll} disabled={previewing || enrolling || (preview?.total ?? 0) === 0}>
              {enrolling ? 'Enrolling…' : `Enroll ${preview?.total ?? ''} fresher${(preview?.total ?? 0) === 1 ? '' : 's'}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContentLayout>
  );
}

// Labelled meta cell for the program header grid.
function MetaItem({ icon: Icon, label, value }: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        {/* title = the untruncated value, so a long degree/department list stays readable on hover */}
        <div className="font-medium truncate" title={value != null ? String(value) : undefined}>
          {value ?? '—'}
        </div>
      </div>
    </div>
  );
}

// KPI card for the cohort-at-a-glance strip.
function StatCard({ icon: Icon, label, value, muted }: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
  muted?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 transition-colors hover:border-primary/40">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${muted ? 'text-muted-foreground' : ''}`}>{value}</div>
    </div>
  );
}
