'use client';

/**
 * DriveForm — one form for both "New drive" and "Edit drive".
 *
 * The parent owns persistence (create vs PATCH); this component only collects
 * values and validates. In edit mode the audience section warns that changing
 * institutions / semesters on an open drive notifies the newly eligible
 * learners (and nobody twice).
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Briefcase,
  CalendarDays,
  FileText,
  GraduationCap,
  IndianRupee,
  Info,
  Loader2,
  MapPin,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCdcLookups } from '@/hooks/cdc/use-cdc-drives';
import { useJkknInstitutions } from '@/hooks/use-jkkn-institutions';
import type {
  CdcDrive,
  CdcDriveCircular,
  CdcDriveEligibility,
  CdcDriveEligibilityInput,
  CdcDriveInstitutionSemesters,
  CdcDriveMode,
} from '@/types/cdc';
import { RecruiterQuickAdd } from '../new/_components/recruiter-quick-add';
import { InstitutionSemesterPicker, describeTargeting } from './institution-semester-picker';
import { CircularAttachment } from './circular-attachment';

export interface DriveFormValues {
  title: string;
  description: string | null;
  recruiter_id: string;
  drive_type_id: string;
  institutions: string[];
  institution_semesters: CdcDriveInstitutionSemesters;
  circular: CdcDriveCircular | null;
  /** object = upsert, null = remove existing, undefined = leave untouched */
  eligibility: CdcDriveEligibilityInput | null | undefined;
  rounds_count: number;
  drive_mode: CdcDriveMode;
  location_url: string | null;
  drive_date: string | null;
  drive_start_time: string | null;
  drive_end_time: string | null;
  willingness_window_close_at: string | null;
  venue_label: string | null;
  expected_package_lpa: number | null;
  job_role_title: string | null;
  job_location: string | null;
}

interface Props {
  mode: 'create' | 'edit';
  drive?: CdcDrive;
  eligibility?: CdcDriveEligibility | null;
  submitting: boolean;
  submitError: string | null;
  onSubmit: (values: DriveFormValues) => void | Promise<void>;
  cancelHref: string;
}

function SectionHeader({
  step,
  icon: Icon,
  title,
  description,
}: {
  step: number;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
}) {
  return (
    <CardHeader className="pb-4">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
          {step}
        </div>
        <div className="min-w-0">
          <CardTitle className="text-base flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            {title}
          </CardTitle>
          {description ? <CardDescription className="mt-1">{description}</CardDescription> : null}
        </div>
      </div>
    </CardHeader>
  );
}

/** timestamptz → value for <input type="datetime-local"> in the browser's zone. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function DriveForm({ mode, drive, eligibility, submitting, submitError, onSubmit, cancelHref }: Props) {
  const { data: lookups, isLoading: lookupsLoading } = useCdcLookups();
  const {
    data: institutionsData,
    isLoading: instLoading,
    isError: instIsError,
    error: instError,
  } = useJkknInstitutions({ limit: 50 });

  const [title, setTitle] = useState(drive?.title ?? '');
  const [description, setDescription] = useState(drive?.description ?? '');
  const [recruiterId, setRecruiterId] = useState(drive?.recruiter_id ?? '');
  const [driveTypeId, setDriveTypeId] = useState(drive?.drive_type_id ?? '');
  const [institutions, setInstitutions] = useState<string[]>(drive?.institutions ?? []);
  const [targeting, setTargeting] = useState<CdcDriveInstitutionSemesters>(drive?.institution_semesters ?? []);
  const [circular, setCircular] = useState<CdcDriveCircular | null>(
    drive?.circular_drive_file_id
      ? {
          drive_file_id: drive.circular_drive_file_id,
          file_name: drive.circular_file_name ?? 'circular',
          mime_type: drive.circular_mime_type ?? 'application/octet-stream',
          size_bytes: drive.circular_size_bytes ?? null,
          url: drive.campus_circular_url ?? null,
          uploaded_at: drive.circular_uploaded_at ?? null,
          uploaded_by: drive.circular_uploaded_by ?? null,
        }
      : null
  );
  const [roundsCount, setRoundsCount] = useState(drive?.rounds_count ?? 1);
  const [driveMode, setDriveMode] = useState<CdcDriveMode>(drive?.drive_mode ?? 'on_campus');
  const [locationUrl, setLocationUrl] = useState(drive?.location_url ?? '');
  const [driveDate, setDriveDate] = useState(drive?.drive_date ?? '');
  const [driveStartTime, setDriveStartTime] = useState(drive?.drive_start_time?.slice(0, 5) ?? '');
  const [driveEndTime, setDriveEndTime] = useState(drive?.drive_end_time?.slice(0, 5) ?? '');
  const [deadline, setDeadline] = useState(toLocalInput(drive?.willingness_window_close_at));
  const [venueLabel, setVenueLabel] = useState(drive?.venue_label ?? '');
  const [expectedPackage, setExpectedPackage] = useState(
    drive?.expected_package_lpa != null ? String(drive.expected_package_lpa) : ''
  );
  const [jobRoleTitle, setJobRoleTitle] = useState(drive?.job_role_title ?? '');
  const [jobLocation, setJobLocation] = useState(drive?.job_location ?? '');
  const [minCgpa, setMinCgpa] = useState(eligibility?.min_cgpa != null ? String(eligibility.min_cgpa) : '');
  const [maxArrears, setMaxArrears] = useState(eligibility?.max_arrears != null ? String(eligibility.max_arrears) : '');
  const [passedOutAllowed, setPassedOutAllowed] = useState(eligibility?.passed_out_allowed ?? false);
  const [eligibilityNotes, setEligibilityNotes] = useState(eligibility?.additional_notes ?? '');
  const [localError, setLocalError] = useState<string | null>(null);

  const allInstitutions = useMemo(
    () => (institutionsData?.data ?? []).map((i) => ({ id: i.id, name: i.name })),
    [institutionsData]
  );
  const recruiterName = lookups?.recruiters.find((r) => r.id === recruiterId)?.name;
  const isOpen = drive?.status === 'willingness_open';
  const errorText = localError ?? submitError;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (!title.trim()) return setLocalError('Title is required');
    if (!recruiterId) return setLocalError('Recruiter is required');
    if (!driveTypeId) return setLocalError('Drive type is required');
    if (institutions.length === 0) return setLocalError('Select at least one institution');
    if (driveMode === 'off_campus' && !locationUrl.trim()) {
      return setLocalError('Live location link is required for off-campus drives');
    }
    if (driveStartTime && driveEndTime && driveStartTime > driveEndTime) {
      return setLocalError('End time must be after the start time');
    }
    const cgpa = minCgpa ? parseFloat(minCgpa) : null;
    if (cgpa != null && (Number.isNaN(cgpa) || cgpa < 0 || cgpa > 10)) {
      return setLocalError('Minimum CGPA must be between 0 and 10');
    }
    const arrears = maxArrears ? parseInt(maxArrears, 10) : null;
    if (arrears != null && (Number.isNaN(arrears) || arrears < 0)) {
      return setLocalError('Maximum arrears cannot be negative');
    }
    const hasEligibility = cgpa != null || arrears != null || passedOutAllowed || eligibilityNotes.trim();

    void onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      recruiter_id: recruiterId,
      drive_type_id: driveTypeId,
      institutions,
      institution_semesters: targeting.filter((t) => institutions.includes(t.institution_id)),
      circular,
      eligibility: hasEligibility
        ? {
            min_cgpa: cgpa,
            max_arrears: arrears,
            passed_out_allowed: passedOutAllowed,
            additional_notes: eligibilityNotes.trim() || null,
          }
        : eligibility
          ? null
          : undefined,
      rounds_count: roundsCount,
      drive_mode: driveMode,
      location_url: driveMode === 'off_campus' ? locationUrl.trim() || null : null,
      drive_date: driveDate || null,
      drive_start_time: driveStartTime || null,
      drive_end_time: driveEndTime || null,
      willingness_window_close_at: fromLocalInput(deadline),
      venue_label: venueLabel.trim() || null,
      expected_package_lpa: expectedPackage ? parseFloat(expectedPackage) : null,
      job_role_title: jobRoleTitle.trim() || null,
      job_location: jobLocation.trim() || null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl pb-24">
      <div className="space-y-5">
        {/* 1. Basic details */}
        <Card>
          <SectionHeader step={1} icon={Briefcase} title="Basic details" description="What the drive is and who is recruiting." />
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title *</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. TCS Campus Drive 2026 — CSE/IT" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional notes for coordinators and learners" rows={3} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="recruiter">Recruiter *</Label>
                  <RecruiterQuickAdd onCreated={(newId) => { if (newId) setRecruiterId(newId); }} />
                </div>
                <Select value={recruiterId} onValueChange={setRecruiterId}>
                  <SelectTrigger id="recruiter">
                    <SelectValue placeholder={lookupsLoading ? 'Loading…' : 'Select recruiter'} />
                  </SelectTrigger>
                  <SelectContent>
                    {(lookups?.recruiters ?? []).map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="drive-type">Drive type *</Label>
                <Select value={driveTypeId} onValueChange={setDriveTypeId}>
                  <SelectTrigger id="drive-type">
                    <SelectValue placeholder={lookupsLoading ? 'Loading…' : 'Select type'} />
                  </SelectTrigger>
                  <SelectContent>
                    {(lookups?.drive_types ?? []).map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.display_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 2. Audience */}
        <Card>
          <SectionHeader
            step={2}
            icon={Users}
            title="Audience — institutions & semesters *"
            description="Pick the institutions, then the semesters in each. Only these learners receive the willingness notification."
          />
          <CardContent>
            <InstitutionSemesterPicker
              institutions={allInstitutions}
              institutionsLoading={instLoading}
              institutionsError={instIsError ? (instError instanceof Error ? instError.message : 'Unknown error') : null}
              selectedInstitutions={institutions}
              onSelectedInstitutionsChange={setInstitutions}
              targeting={targeting}
              onTargetingChange={setTargeting}
            />
            {institutions.length > 0 ? (
              <div className="mt-4 flex items-start gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Targeting: <strong className="text-foreground">{describeTargeting(targeting, institutions.length)}</strong>.{' '}
                  {isOpen
                    ? 'This drive is already open: saving a changed audience notifies only the newly eligible learners. Nobody is notified twice.'
                    : 'Learners are notified when willingness opens.'}
                </span>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* 3. Eligibility criteria */}
        <Card>
          <SectionHeader
            step={3}
            icon={GraduationCap}
            title="Eligibility criteria"
            description="Optional. Shown to learners on the willingness page so they can self-check before confirming."
          />
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="min-cgpa">Minimum CGPA</Label>
                <Input id="min-cgpa" type="number" step="0.01" min={0} max={10} value={minCgpa} onChange={(e) => setMinCgpa(e.target.value)} placeholder="e.g. 6.5" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="max-arrears">Maximum arrears</Label>
                <Input id="max-arrears" type="number" min={0} value={maxArrears} onChange={(e) => setMaxArrears(e.target.value)} placeholder="e.g. 0" />
              </div>
              <label className="flex items-center gap-2 pt-6 text-sm">
                <Checkbox checked={passedOutAllowed} onCheckedChange={(v) => setPassedOutAllowed(v === true)} />
                Passed-out learners allowed
              </label>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eligibility-notes">Additional criteria</Label>
              <Textarea id="eligibility-notes" value={eligibilityNotes} onChange={(e) => setEligibilityNotes(e.target.value)} rows={2} placeholder="e.g. No standing arrears at the time of joining; 60% throughout" />
            </div>
          </CardContent>
        </Card>

        {/* 4. Circular */}
        <Card>
          <SectionHeader step={4} icon={FileText} title="Circular attachment" description="Optional. Stored in Google Drive; learners see it on the drive page." />
          <CardContent>
            <CircularAttachment
              value={circular}
              onChange={setCircular}
              driveId={mode === 'edit' && drive?.circular_drive_file_id === circular?.drive_file_id ? drive?.id : undefined}
              driveTitle={title}
              recruiterId={recruiterId}
            />
            {recruiterName && !circular ? (
              <p className="mt-2 text-xs text-muted-foreground">Will be filed under <strong>CDC Drives / {recruiterName}</strong>.</p>
            ) : null}
            {mode === 'edit' ? (
              <p className="mt-2 text-xs text-muted-foreground">Replacing or removing takes effect when you save.</p>
            ) : null}
          </CardContent>
        </Card>

        {/* 5. Schedule + venue + deadline */}
        <Card>
          <SectionHeader step={5} icon={CalendarDays} title="Schedule, venue & deadline" />
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="drive-mode">Drive mode</Label>
                <Select value={driveMode} onValueChange={(v) => setDriveMode(v as CdcDriveMode)}>
                  <SelectTrigger id="drive-mode"><SelectValue placeholder="Select mode" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="on_campus">On-Campus</SelectItem>
                    <SelectItem value="off_campus">Off-Campus</SelectItem>
                    <SelectItem value="walk_in">Walk-in</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {driveMode === 'off_campus' ? (
                <div className="space-y-1.5">
                  <Label htmlFor="location-url">Live location link *</Label>
                  <Input id="location-url" type="url" value={locationUrl} onChange={(e) => setLocationUrl(e.target.value)} placeholder="e.g. https://maps.app.goo.gl/…" required />
                  <p className="text-xs text-muted-foreground">Shareable map / live-location link for the off-campus venue.</p>
                </div>
              ) : null}
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="drive-date">Drive date</Label>
                <Input id="drive-date" type="date" value={driveDate} onChange={(e) => setDriveDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="start-time">Start time</Label>
                <Input id="start-time" type="time" value={driveStartTime} onChange={(e) => setDriveStartTime(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="end-time">End time</Label>
                <Input id="end-time" type="time" value={driveEndTime} onChange={(e) => setDriveEndTime(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="venue" className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-muted-foreground" /> Venue</Label>
                <Input id="venue" value={venueLabel} onChange={(e) => setVenueLabel(e.target.value)} placeholder="e.g. KEC Main Auditorium" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rounds">Rounds count</Label>
                <Input id="rounds" type="number" min={1} max={10} value={roundsCount} onChange={(e) => setRoundsCount(parseInt(e.target.value, 10) || 1)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="deadline">Willingness deadline</Label>
                <Input id="deadline" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
                <p className="text-xs text-muted-foreground">Learners cannot respond after this. Leave empty for no deadline.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 6. Offer details */}
        <Card>
          <SectionHeader step={6} icon={IndianRupee} title="Offer details" description="Optional — shown to learners on the willingness page." />
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="package">Expected package (LPA)</Label>
                <Input id="package" type="number" step="0.1" min={0} value={expectedPackage} onChange={(e) => setExpectedPackage(e.target.value)} placeholder="e.g. 6.5" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="role">Job role</Label>
                <Input id="role" value={jobRoleTitle} onChange={(e) => setJobRoleTitle(e.target.value)} placeholder="e.g. Software Engineer" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="location">Job location</Label>
                <Input id="location" value={jobLocation} onChange={(e) => setJobLocation(e.target.value)} placeholder="e.g. Bangalore" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="text-xs text-muted-foreground min-w-0">
            {errorText ? (
              <span className="text-destructive font-medium">{errorText}</span>
            ) : institutions.length > 0 ? (
              <span>{describeTargeting(targeting, institutions.length)}{circular ? ' · circular attached' : ''}</span>
            ) : (
              <span>Select at least one institution to continue.</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" asChild>
              <Link href={cancelHref}>Cancel</Link>
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {mode === 'create' ? 'Creating…' : 'Saving…'}</>
              ) : mode === 'create' ? (
                'Create Drive'
              ) : (
                'Save changes'
              )}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
