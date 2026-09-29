'use client';

/**
 * Learner-facing willingness declaration — the learner branch of
 * /cdc/drives/[id]/willingness (page.tsx dispatches on role).
 *
 * Reached from the "willingness open" notification (bell + push) sent to the
 * learners in the drive's institution + semester audience.
 *
 * INTENTIONALLY not wrapped in <PermissionGuard module="cdc.drives">: this is a
 * learner self-service surface. Access is enforced server-side — the API
 * resolves auth.uid() to the learner's own profile and RLS scopes the
 * willingness row.
 *
 * Flow: drive details + circular → eligibility (institution + semester) →
 * profile details auto-filled from the learner profile (name / email / mobile,
 * never typed) → optional additional mobile → CGPA + arrears from COE →
 * data-permission checkbox → confirm. One response per learner per drive.
 *
 * 2026-05-21 — INTENTIONALLY not wrapped in <PermissionGuard module="cdc.drives" action="view">
 *   because this is a learner self-service surface. Students typically lack
 *   cdc.drives.view (that's the coordinator dashboard) but must be able to
 *   respond to the willingness invite they received. Access is enforced at the
 *   RLS layer: the willingness service queries the row keyed on
 *   `learner_id = auth.uid()`, so unauthorized users get a "not eligible" view
 *   instead of data leakage.
 *
 * Behavior matrix:
 *   - drive not willingness_open  → "drive not currently open" message
 *   - willingness window not yet started / already ended (the drive's optional
 *     willingness_window_open_at / _close_at dates) → same closed treatment,
 *     but the copy names the date rather than the status
 *   - learner not eligible        → friendly explainer, no submit buttons
 *   - no existing willingness     → show "I'm in" + "I decline"
 *   - existing status='willing'   → show "You're in" + "Withdraw"
 *   - existing status='withdrawn' → show "You declined" + "Change to I'm in"
 *   - existing status='confirmed' → show locked badge (post-window state)
 */

import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileText,
  GraduationCap,
  Info,
  Loader2,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  User,
  XCircle,
} from 'lucide-react';
import type { LearnerWillingnessSnapshot } from '@/lib/services/cdc/willingness-service';
import type { CdcDriveWillingness } from '@/types/cdc';
import { CDC_DRIVE_STATUS_LABELS } from '@/types/cdc';

const OUTCOME_TEXT: Record<string, string> = {
  selected: 'Selected',
  waitlisted: 'Waitlisted',
  rejected: 'Not selected',
  hold: 'On hold',
};
const LETTER_TEXT: Record<string, string> = {
  offer_letter: 'Offer letter',
  appointment_letter: 'Appointment letter',
  joining_letter: 'Joining letter',
  internship_letter: 'Internship letter',
  training_letter: 'Training letter',
  salary_letter: 'Salary letter',
  other: 'Document',
};

const ATTENDANCE_TEXT: Record<string, string> = {
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  excused: 'Excused',
  not_attended: 'Not attended',
};

const API_BASE = '/api/cdc/drives';

/**
 * A willingness-window bound, for a learner to read. Falls back to vaguer
 * wording rather than printing "Invalid Date" when the drive has no bound set
 * (which is legitimate — a NULL bound means no limit on that side).
 */
function formatWindowMoment(iso: string | null): string {
  if (!iso) return 'an unspecified time';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'an unspecified time';
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function useLearnerWillingnessSnapshot(driveId: string) {
  return useQuery({
    queryKey: ['cdc-learner-willingness', driveId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/${driveId}/willingness`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to load willingness page (${res.status})`);
      }
      return (await res.json()) as LearnerWillingnessSnapshot;
    },
    enabled: !!driveId,
  });
}

interface DeclareInput {
  intent: 'willing' | 'decline';
  additional_mobile?: string | null;
  data_consent?: boolean;
  cgpa?: number | null;
  arrears_count?: number | null;
}

/** COE CGPA / arrears, fetched after the page is up so the page never waits on COE. */
function useLearnerAcademic(driveId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['cdc-learner-willingness-academic', driveId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/${driveId}/willingness?include=academic`);
      if (!res.ok) return null;
      return ((await res.json()).academic ?? null) as LearnerWillingnessSnapshot['academic'];
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

function useDeclareWillingness(driveId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: DeclareInput) => {
      const res = await fetch(`${API_BASE}/${driveId}/willingness`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Declaration failed');
      }
      return (await res.json()).data as CdcDriveWillingness;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cdc-learner-willingness', driveId] });
    },
  });
}

function DetailRow({
  icon: Icon,
  label,
  value,
  missing,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null | undefined;
  missing?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        {value ? (
          <p className="text-sm font-medium break-words">{value}</p>
        ) : (
          <p className={`text-sm ${missing ? 'text-destructive' : 'text-muted-foreground'}`}>
            {missing ? 'Missing on your profile' : '—'}
          </p>
        )}
      </div>
    </div>
  );
}

export function LearnerWillingnessView({ id }: { id: string }) {
  const { data: snapshot, isLoading, error } = useLearnerWillingnessSnapshot(id);
  // Academic figures only matter while the learner can still respond.
  const { data: academicLazy, isLoading: academicLoading } = useLearnerAcademic(
    id,
    !!snapshot && snapshot.is_eligible && snapshot.is_window_open && snapshot.willingness?.status !== 'confirmed'
  );
  const declare = useDeclareWillingness(id);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [additionalMobile, setAdditionalMobile] = useState('');
  const [consent, setConsent] = useState(false);
  // Mandatory academic inputs (2026-09-16). Pre-filled from COE when published
  // results exist, otherwise the learner types them.
  const [cgpaInput, setCgpaInput] = useState('');
  const [arrearsInput, setArrearsInput] = useState('');
  // Withdraw needs an explicit acknowledgement before it is submitted.
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAck, setWithdrawAck] = useState(false);

  // Pre-fill from an earlier submission once per willingness row (render-time
  // derivation, per React's "adjusting state when a prop changes" pattern).
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const seedKey = snapshot?.willingness?.id ?? null;
  if (seedKey !== seededFor) {
    setSeededFor(seedKey);
    if (snapshot?.willingness?.additional_mobile) {
      setAdditionalMobile(snapshot.willingness.additional_mobile);
    }
    if (snapshot?.willingness?.data_consent_at) setConsent(true);
    const seedCgpa = snapshot?.willingness?.cgpa ?? null;
    const seedArrears = snapshot?.willingness?.arrears_count ?? null;
    setCgpaInput(seedCgpa != null ? Number(seedCgpa).toFixed(2) : '');
    setArrearsInput(seedArrears != null ? String(seedArrears) : '');
  }
  // COE figures arrive later; pre-fill only fields the learner has not typed.
  const [academicSeededFor, setAcademicSeededFor] = useState<string | null>(null);
  const academicKey = academicLazy ? `${academicLazy.source}:${academicLazy.cgpa ?? ''}:${academicLazy.arrears_count}` : null;
  if (academicKey && academicKey !== academicSeededFor) {
    setAcademicSeededFor(academicKey);
    if (academicLazy && academicLazy.source !== 'unavailable') {
      if (cgpaInput === '' && academicLazy.cgpa != null) setCgpaInput(academicLazy.cgpa.toFixed(2));
      if (arrearsInput === '') setArrearsInput(String(academicLazy.arrears_count));
    }
  }

  if (isLoading) {
    return (
      <ContentLayout title="Drive willingness">
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-40" />
            <Skeleton className="h-48" />
          </div>
          <Skeleton className="h-64" />
        </div>
      </ContentLayout>
    );
  }

  if (error || !snapshot) {
    return (
      <ContentLayout title="Drive willingness">
        <div className="p-6">
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : 'Could not load this drive'}
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/">Back home</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const {
    drive,
    circular,
    recruiter,
    drive_type,
    willingness,
    learner,
    missing_profile_fields,
    is_eligible,
    ineligible_reason,
    is_window_open,
    deadline_passed,
    eligibility,
    window_state,
  } = snapshot;
  const participation = (snapshot as typeof snapshot & {
    participation?: { finalized: boolean; is_participant: boolean; attendance_status: string | null };
  }).participation;
  const outcome = (snapshot as typeof snapshot & {
    outcome?: { decision: string | null; documents: Array<{ id: string; document_type: string; file_name: string; uploaded_at: string }> };
  }).outcome;
  const academic = academicLazy ?? snapshot.academic ?? null;
  const hasCriteria =
    !!eligibility &&
    (eligibility.min_cgpa != null || eligibility.max_arrears != null || !!eligibility.additional_notes || eligibility.passed_out_allowed);

  const parsedCgpa = cgpaInput.trim() === '' ? null : Number(cgpaInput);
  const parsedArrears = arrearsInput.trim() === '' ? null : Number(arrearsInput);
  const cgpaValid = parsedCgpa != null && Number.isFinite(parsedCgpa) && parsedCgpa >= 0 && parsedCgpa <= 10;
  const arrearsValid =
    parsedArrears != null && Number.isInteger(parsedArrears) && parsedArrears >= 0 && parsedArrears <= 99;

  async function handleDeclare(intent: 'willing' | 'decline') {
    setSubmitError(null);
    try {
      await declare.mutateAsync({
        intent,
        additional_mobile: additionalMobile.trim() || null,
        data_consent: consent,
        cgpa: intent === 'willing' ? parsedCgpa : null,
        arrears_count: intent === 'willing' ? parsedArrears : null,
      });
      toast.success(intent === 'willing' ? "You're in. Good luck." : 'Noted — you declined this drive.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save your response';
      setSubmitError(msg);
      toast.error(msg);
    }
  }

  const currentStatus = willingness?.status ?? null;
  const canAct = is_window_open && is_eligible;
  const showInitialButtons = canAct && !currentStatus;
  const showWithdrawButton = canAct && currentStatus === 'willing';
  const showOptInAgainButton = canAct && currentStatus === 'withdrawn';
  const isLocked = currentStatus === 'confirmed' || currentStatus === 'no_show';
  const profileIncomplete = missing_profile_fields.length > 0;
  const academicIncomplete = !cgpaValid || !arrearsValid;
  const confirmDisabled = declare.isPending || !consent || profileIncomplete || academicIncomplete;

  return (
    <ContentLayout title={drive.title}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Drive willingness</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* Left: Drive details + circular + eligibility + your details */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-xl">{drive.title}</CardTitle>
                  {drive.description ? (
                    <p className="text-sm text-muted-foreground mt-1">{drive.description}</p>
                  ) : null}
                </div>
                <Badge variant={is_window_open ? 'default' : 'secondary'}>
                  {window_state === 'closed'
                    ? 'Willingness Closed'
                    : window_state === 'not_yet_open'
                      ? 'Willingness Not Yet Open'
                      : CDC_DRIVE_STATUS_LABELS[drive.status]}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 text-sm">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Recruiter:</span>
                <span>{recruiter?.name ?? '—'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">Type:</span>
                <span>{drive_type?.display_name ?? '—'}</span>
              </div>
              {drive.drive_date ? (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Date:</span>
                  <span>
                    {drive.drive_date}
                    {drive.drive_start_time ? ` · ${drive.drive_start_time}` : ''}
                    {drive.drive_end_time ? ` – ${drive.drive_end_time}` : ''}
                  </span>
                </div>
              ) : null}
              {drive.venue_label ? (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Venue:</span>
                  <span>{drive.venue_label}</span>
                </div>
              ) : null}
              {drive.willingness_window_close_at ? (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Respond by:</span>
                  <span className={deadline_passed ? 'text-destructive' : ''}>
                    {new Date(drive.willingness_window_close_at).toLocaleString()}
                    {deadline_passed ? ' (closed)' : ''}
                  </span>
                </div>
              ) : null}
              {drive.location_url ? (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <a href={drive.location_url} target="_blank" rel="noopener noreferrer" className="underline">
                    Open live location
                  </a>
                </div>
              ) : null}
              {drive.job_role_title ? (
                <div className="flex items-center gap-2">
                  <span className="font-medium">Role:</span>
                  <span>{drive.job_role_title}</span>
                </div>
              ) : null}
              {drive.job_location ? (
                <div className="flex items-center gap-2">
                  <span className="font-medium">Location:</span>
                  <span>{drive.job_location}</span>
                </div>
              ) : null}
              {drive.expected_package_lpa ? (
                <div className="flex items-center gap-2">
                  <span className="font-medium">Expected package:</span>
                  <span>{drive.expected_package_lpa} LPA</span>
                </div>
              ) : recruiter?.package_band_min_lpa || recruiter?.package_band_max_lpa ? (
                <div className="flex items-center gap-2">
                  <span className="font-medium">Package band:</span>
                  <span>
                    {recruiter.package_band_min_lpa ?? '—'}–{recruiter.package_band_max_lpa ?? '—'} LPA
                  </span>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Circular */}
          {circular ? (
            <Card>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Drive circular</p>
                  <p className="text-xs text-muted-foreground truncate">{circular.file_name}</p>
                </div>
                <div className="flex gap-1">
                  <Button asChild variant="outline" size="sm">
                    <a href={`${API_BASE}/${drive.id}/circular`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-1" /> View
                    </a>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <a href={`${API_BASE}/${drive.id}/circular?download=1`}>
                      <Download className="h-4 w-4 mr-1" /> Download
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {hasCriteria && eligibility ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-muted-foreground" />
                  Eligibility criteria
                </CardTitle>
                <CardDescription>Set by the recruiter — check these against your academic standing below.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-3 text-sm">
                {eligibility.min_cgpa != null ? (
                  <div><span className="text-muted-foreground">Minimum CGPA</span><p className="font-medium">{eligibility.min_cgpa}</p></div>
                ) : null}
                {eligibility.max_arrears != null ? (
                  <div><span className="text-muted-foreground">Maximum arrears</span><p className="font-medium">{eligibility.max_arrears}</p></div>
                ) : null}
                <div><span className="text-muted-foreground">Passed-out learners</span><p className="font-medium">{eligibility.passed_out_allowed ? 'Allowed' : 'Not allowed'}</p></div>
                {eligibility.additional_notes ? <p className="sm:col-span-3 text-muted-foreground">{eligibility.additional_notes}</p> : null}
              </CardContent>
            </Card>
          ) : null}

          {/* Your details — shown when the learner can act (or already responded) */}
          {(canAct || currentStatus) && is_eligible ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  Your details
                </CardTitle>
                <CardDescription>
                  Taken from your learner profile — nothing to type. Ask your office if something is wrong.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  <DetailRow icon={User} label="Name" value={learner.full_name} missing={missing_profile_fields.includes('full_name')} />
                  <DetailRow icon={Mail} label="Email" value={learner.email} missing={missing_profile_fields.includes('email')} />
                  <DetailRow icon={Phone} label="Mobile number" value={learner.mobile} missing={missing_profile_fields.includes('mobile')} />
                  <DetailRow
                    icon={GraduationCap}
                    label="Register number · Semester"
                    value={[learner.register_number, learner.semester_order != null ? `Semester ${learner.semester_order}` : learner.semester_label]
                      .filter(Boolean)
                      .join(' · ') || null}
                  />
                </div>

                {canAct && !isLocked ? (
                  <div className="mt-3 space-y-1.5">
                    <Label htmlFor="additional-mobile">Additional mobile number (optional)</Label>
                    <Input
                      id="additional-mobile"
                      type="tel"
                      inputMode="tel"
                      value={additionalMobile}
                      onChange={(e) => setAdditionalMobile(e.target.value)}
                      placeholder="Another number recruiters can reach you on"
                      maxLength={18}
                    />
                  </div>
                ) : willingness?.additional_mobile ? (
                  <DetailRow icon={Phone} label="Additional mobile" value={willingness.additional_mobile} />
                ) : null}

                {/* Academic standing */}
                <div className="mt-4 rounded-md border p-3">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-muted-foreground" />
                    Academic standing
                  </p>
                  {academic ? (
                    <>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <div className="rounded-md bg-muted/40 p-3">
                          <p className="text-2xl font-semibold leading-none">
                            {academic.cgpa != null ? academic.cgpa.toFixed(2) : '—'}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">CGPA</p>
                        </div>
                        <div className="rounded-md bg-muted/40 p-3">
                          <p className="text-2xl font-semibold leading-none">
                            {academic.source === 'unavailable' ? '—' : academic.arrears_count}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">Arrears</p>
                        </div>
                      </div>
                      {academic.arrears.length > 0 ? (
                        <ul className="mt-2 space-y-1 text-xs">
                          {academic.arrears.map((a, i) => (
                            <li key={`${a.course_code ?? i}`} className="flex items-center justify-between gap-2 rounded bg-muted/30 px-2 py-1">
                              <span className="truncate">
                                <span className="font-medium">{a.course_code ?? '—'}</span>
                                {a.course_name ? ` · ${a.course_name}` : ''}
                              </span>
                              <span className="text-muted-foreground shrink-0">
                                {a.semester ? `Sem ${a.semester}` : ''}
                                {a.attempts > 1 ? ` · ${a.attempts} attempts` : ''}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {academic.note ? (
                        <p className="mt-2 text-xs text-muted-foreground flex items-start gap-1.5">
                          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          {academic.note}
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground">
                          From your published examination results. You confirm the figures in the response panel.
                        </p>
                      )}
                    </>
                  ) : willingness && willingness.status !== 'withdrawn' ? (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div className="rounded-md bg-muted/40 p-3">
                        <p className="text-2xl font-semibold leading-none">
                          {willingness.cgpa != null ? Number(willingness.cgpa).toFixed(2) : '—'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">CGPA (at submission)</p>
                      </div>
                      <div className="rounded-md bg-muted/40 p-3">
                        <p className="text-2xl font-semibold leading-none">{willingness.arrears_count ?? '—'}</p>
                        <p className="text-xs text-muted-foreground mt-1">Arrears (at submission)</p>
                      </div>
                    </div>
                  ) : academicLoading ? (
                    <p className="mt-2 text-xs text-muted-foreground">Checking your published results…</p>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">You enter these in the response panel when you confirm.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* Right: response panel */}
        <div className="space-y-4">
          {participation?.finalized ? (
            <Alert>
              {participation.is_participant ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Info className="h-4 w-4" />}
              <AlertTitle>
                {participation.is_participant ? 'You are shortlisted for this drive' : 'You are not on the final participant list'}
              </AlertTitle>
              <AlertDescription>
                {participation.is_participant
                  ? participation.attendance_status
                    ? `Your drive-day attendance: ${ATTENDANCE_TEXT[participation.attendance_status] ?? participation.attendance_status}.`
                    : 'Report on time with your ID card and resume. Your attendance will appear here after the drive.'
                  : 'The placement team has finalized participants for this drive. Contact the coordinator if you think this is a mistake.'}
              </AlertDescription>
            </Alert>
          ) : null}
          {outcome?.decision ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Your result</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Badge variant={outcome.decision === 'selected' ? 'default' : 'secondary'}>
                  {OUTCOME_TEXT[outcome.decision] ?? outcome.decision}
                </Badge>
                {outcome.documents.length > 0 ? (
                  <ul className="space-y-2">
                    {outcome.documents.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                        <span className="min-w-0 truncate flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          {LETTER_TEXT[d.document_type] ?? 'Document'}
                        </span>
                        <span className="flex gap-1 shrink-0">
                          <Button asChild variant="outline" size="sm">
                            <a href={`${API_BASE}/${drive.id}/documents/${d.id}`} target="_blank" rel="noopener noreferrer">View</a>
                          </Button>
                          <Button asChild variant="outline" size="sm">
                            <a href={`${API_BASE}/${drive.id}/documents/${d.id}?download=1`}><Download className="h-4 w-4" /></a>
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : outcome.decision === 'selected' ? (
                  <p className="text-xs text-muted-foreground">Your offer letter will appear here once the placement team uploads it.</p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your response</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!is_window_open ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>
                    {window_state === 'closed'
                      ? 'The window for responding has closed.'
                      : window_state === 'not_yet_open'
                        ? 'This drive is not accepting responses yet.'
                        : deadline_passed
                          ? 'The willingness deadline has passed'
                          : 'Not open for willingness right now'}
                  </AlertTitle>
                  <AlertDescription>
                    {window_state === 'closed'
                      ? 'Responses closed on ' +
                        formatWindowMoment(drive.willingness_window_close_at) +
                        '. Contact the Career Development Centre if you still want to take part.'
                      : window_state === 'not_yet_open'
                        ? 'You can respond from ' +
                          formatWindowMoment(drive.willingness_window_open_at) +
                          '.'
                        : deadline_passed
                          ? `Responses closed on ${new Date(drive.willingness_window_close_at!).toLocaleString()}. Contact the placement team if you still want to take part.`
                          : `Current status: ${CDC_DRIVE_STATUS_LABELS[drive.status]}. You cannot declare or change your response.`}
                  </AlertDescription>
                </Alert>
              ) : null}

              {is_window_open && !is_eligible ? (
                <Alert>
                  <XCircle className="h-4 w-4" />
                  <AlertTitle>Not in this drive&apos;s audience</AlertTitle>
                  <AlertDescription>{ineligible_reason ?? 'You are not eligible for this drive.'}</AlertDescription>
                </Alert>
              ) : null}

              {currentStatus ? (
                <div className="rounded-md border p-3 text-sm space-y-1">
                  <div className="flex items-center gap-2">
                    {currentStatus === 'willing' ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : currentStatus === 'withdrawn' ? (
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-blue-600" />
                    )}
                    <span className="font-medium">
                      {currentStatus === 'willing'
                        ? "You're in"
                        : currentStatus === 'withdrawn'
                          ? 'You declined this drive'
                          : currentStatus === 'confirmed'
                            ? 'Confirmed (locked)'
                            : currentStatus === 'no_show'
                              ? 'Marked as no-show'
                              : currentStatus}
                    </span>
                  </div>
                  {willingness?.declared_at ? (
                    <p className="text-xs text-muted-foreground">
                      Last updated: {new Date(willingness.declared_at).toLocaleString()}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {canAct && !isLocked && profileIncomplete ? (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertTitle>Profile incomplete</AlertTitle>
                  <AlertDescription>
                    Your {missing_profile_fields.map((f) => ({ full_name: 'name', email: 'email', mobile: 'mobile number' })[f]).join(', ')}{' '}
                    {missing_profile_fields.length === 1 ? 'is' : 'are'} missing on your learner profile. Ask your
                    office to update it, then return here.
                  </AlertDescription>
                </Alert>
              ) : null}

              {(showInitialButtons || showOptInAgainButton) ? (
                <div className="rounded-md border p-3 space-y-2">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-muted-foreground" />
                    Academic standing
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Both fields are mandatory before you confirm.
                    {academic && academic.source !== 'unavailable'
                      ? ' Pre-filled from your published results; correct them if they are outdated.'
                      : ''}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="cdc-cgpa">
                        CGPA <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="cdc-cgpa"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={10}
                        step={0.01}
                        placeholder="e.g. 8.20"
                        value={cgpaInput}
                        onChange={(e) => setCgpaInput(e.target.value)}
                        aria-invalid={cgpaInput !== '' && !cgpaValid}
                      />
                      {cgpaInput !== '' && !cgpaValid ? (
                        <p className="text-xs text-destructive">Enter a value from 0 to 10.</p>
                      ) : null}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="cdc-arrears">
                        Arrears <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="cdc-arrears"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={99}
                        step={1}
                        placeholder="0"
                        value={arrearsInput}
                        onChange={(e) => setArrearsInput(e.target.value)}
                        aria-invalid={arrearsInput !== '' && !arrearsValid}
                      />
                      {arrearsInput !== '' && !arrearsValid ? (
                        <p className="text-xs text-destructive">Enter a whole number, 0 or more.</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

              {(showInitialButtons || showOptInAgainButton) ? (
                <label className="flex items-start gap-2 rounded-md border p-3 text-xs cursor-pointer">
                  <Checkbox
                    checked={consent}
                    onCheckedChange={(v) => setConsent(v === true)}
                    className="mt-0.5"
                  />
                  <span>
                    <ShieldCheck className="inline h-3.5 w-3.5 mr-1 text-muted-foreground" />
                    I permit the Career Development Centre to use my name, email, mobile number(s), CGPA and
                    arrear details shown above for this drive and to share them with the recruiter.
                  </span>
                </label>
              ) : null}

              {showInitialButtons ? (
                <div className="grid gap-2">
                  <Button onClick={() => handleDeclare('willing')} disabled={confirmDisabled} size="lg" className="w-full">
                    {declare.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ThumbsUp className="h-4 w-4 mr-2" />}
                    Confirm willingness
                  </Button>
                  <Button
                    onClick={() => handleDeclare('decline')}
                    disabled={declare.isPending}
                    variant="outline"
                    size="lg"
                    className="w-full"
                  >
                    <ThumbsDown className="h-4 w-4 mr-2" />
                    I decline
                  </Button>
                </div>
              ) : null}

              {showWithdrawButton ? (
                <>
                  <Button
                    onClick={() => {
                      setWithdrawAck(false);
                      setWithdrawOpen(true);
                    }}
                    disabled={declare.isPending}
                    variant="outline"
                    size="sm"
                    className="w-full"
                  >
                    <ThumbsDown className="h-4 w-4 mr-2" />
                    Withdraw
                  </Button>
                  <AlertDialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Withdraw from {drive.title}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          CDC and the recruiter will see you as declined. You can change your mind again
                          while the willingness window is open.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <label className="flex items-start gap-2 rounded-md border p-3 text-xs cursor-pointer">
                        <Checkbox
                          checked={withdrawAck}
                          onCheckedChange={(v) => setWithdrawAck(v === true)}
                          className="mt-0.5"
                        />
                        <span>I confirm that I want to withdraw my willingness for this drive.</span>
                      </label>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={declare.isPending}>Keep my response</AlertDialogCancel>
                        <AlertDialogAction
                          disabled={!withdrawAck || declare.isPending}
                          onClick={(e) => {
                            e.preventDefault();
                            void handleDeclare('decline').finally(() => setWithdrawOpen(false));
                          }}
                        >
                          {declare.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                          Withdraw
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              ) : null}

              {showOptInAgainButton ? (
                <Button onClick={() => handleDeclare('willing')} disabled={confirmDisabled} size="sm" className="w-full">
                  <ThumbsUp className="h-4 w-4 mr-2" />
                  Change to &quot;Confirm willingness&quot;
                </Button>
              ) : null}

              {isLocked ? (
                <p className="text-xs text-muted-foreground">
                  This response has been locked by the placement team. Contact the coordinator if you need to
                  change it.
                </p>
              ) : null}

              {submitError ? <p className="text-xs text-destructive">{submitError}</p> : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </ContentLayout>
  );
}
