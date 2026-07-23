'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateCdcDrive, useCdcLookups } from '@/hooks/cdc/use-cdc-drives';
import { useJkknInstitutions } from '@/hooks/use-jkkn-institutions';
import type { CdcDriveMode } from '@/types/cdc';
import { RecruiterQuickAdd } from './_components/recruiter-quick-add';

export default function NewCdcDrivePage() {
  const router = useRouter();
  const { data: lookups, isLoading: lookupsLoading } = useCdcLookups();
  const {
    data: institutionsData,
    isLoading: instLoading,
    isError: instIsError,
    error: instError,
  } = useJkknInstitutions({ limit: 50 });
  const createDrive = useCreateCdcDrive();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [recruiterId, setRecruiterId] = useState('');
  const [driveTypeId, setDriveTypeId] = useState('');
  const [institutions, setInstitutions] = useState<string[]>([]);
  const [roundsCount, setRoundsCount] = useState(1);
  const [driveMode, setDriveMode] = useState<CdcDriveMode>('on_campus');
  const [locationUrl, setLocationUrl] = useState('');
  const [driveDate, setDriveDate] = useState('');
  const [driveStartTime, setDriveStartTime] = useState('');
  const [driveEndTime, setDriveEndTime] = useState('');
  const [venueLabel, setVenueLabel] = useState('');
  const [expectedPackage, setExpectedPackage] = useState('');
  const [jobRoleTitle, setJobRoleTitle] = useState('');
  const [jobLocation, setJobLocation] = useState('');

  const [submitError, setSubmitError] = useState<string | null>(null);

  const allInstitutions = institutionsData?.data ?? [];

  function toggleInstitution(id: string) {
    setInstitutions((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!title.trim()) {
      setSubmitError('Title is required');
      return;
    }
    if (!recruiterId) {
      setSubmitError('Recruiter is required');
      return;
    }
    if (!driveTypeId) {
      setSubmitError('Drive type is required');
      return;
    }
    if (institutions.length === 0) {
      setSubmitError('Select at least one institution');
      return;
    }
    if (driveMode === 'off_campus' && !locationUrl.trim()) {
      setSubmitError('Live location link is required for off-campus drives');
      return;
    }

    try {
      const created = await createDrive.mutateAsync({
        title: title.trim(),
        description: description.trim() || null,
        recruiter_id: recruiterId,
        drive_type_id: driveTypeId,
        institutions,
        rounds_count: roundsCount,
        drive_mode: driveMode,
        // Only persist a location link for off-campus drives; clears if mode changed away.
        location_url: driveMode === 'off_campus' ? locationUrl.trim() || null : null,
        drive_date: driveDate || null,
        drive_start_time: driveStartTime || null,
        drive_end_time: driveEndTime || null,
        venue_label: venueLabel.trim() || null,
        expected_package_lpa: expectedPackage ? parseFloat(expectedPackage) : null,
        job_role_title: jobRoleTitle.trim() || null,
        job_location: jobLocation.trim() || null,
      });
      router.push(`/cdc/drives/${created.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create drive');
    }
  }

  return (
    <PermissionGuard module="cdc.drives" action="create">
    <ContentLayout title="New Campus Drive">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/cdc/drives">Drives</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4 max-w-3xl">
        <div>
          <h1 className="text-2xl font-semibold">New Drive</h1>
          <p className="text-sm text-muted-foreground">
            Create a drive in <strong>draft</strong> status. You can promote it through the lifecycle
            from the detail page once saved.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Basic details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. TCS Campus Drive 2026 — CSE/IT"
                required
              />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional notes for coordinators and learners"
                rows={3}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
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
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="drive-type">Drive type *</Label>
                <Select value={driveTypeId} onValueChange={setDriveTypeId}>
                  <SelectTrigger id="drive-type">
                    <SelectValue placeholder={lookupsLoading ? 'Loading…' : 'Select type'} />
                  </SelectTrigger>
                  <SelectContent>
                    {(lookups?.drive_types ?? []).map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Institutions *</CardTitle>
          </CardHeader>
          <CardContent>
            {instLoading ? (
              <div className="text-sm text-muted-foreground">Loading institutions…</div>
            ) : instIsError ? (
              <div className="text-sm text-destructive border border-destructive/30 bg-destructive/5 rounded-md p-3">
                Could not load institutions
                {instError instanceof Error ? `: ${instError.message}` : '.'} Please refresh the
                page or contact your administrator if this persists.
              </div>
            ) : allInstitutions.length === 0 ? (
              <div className="text-sm text-muted-foreground border rounded-md p-3">
                No institutions are available to select. Contact your administrator to confirm
                institutions are configured.
              </div>
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {allInstitutions.map((inst) => (
                  <label
                    key={inst.id}
                    className="flex items-center gap-2 border rounded-md p-2 hover:bg-muted/40 cursor-pointer"
                  >
                    <Checkbox
                      checked={institutions.includes(inst.id)}
                      onCheckedChange={() => toggleInstitution(inst.id)}
                    />
                    <span className="text-sm">{inst.name}</span>
                  </label>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Schedule + venue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="drive-mode">Drive mode</Label>
                <Select
                  value={driveMode}
                  onValueChange={(v) => setDriveMode(v as CdcDriveMode)}
                >
                  <SelectTrigger id="drive-mode">
                    <SelectValue placeholder="Select mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="on_campus">On-Campus</SelectItem>
                    <SelectItem value="off_campus">Off-Campus</SelectItem>
                    <SelectItem value="walk_in">Walk-in</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {driveMode === 'off_campus' ? (
                <div>
                  <Label htmlFor="location-url">Live location link *</Label>
                  <Input
                    id="location-url"
                    type="url"
                    value={locationUrl}
                    onChange={(e) => setLocationUrl(e.target.value)}
                    placeholder="e.g. https://maps.app.goo.gl/…"
                    required
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Shareable map / live-location link for the off-campus venue.
                  </p>
                </div>
              ) : null}
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label htmlFor="drive-date">Drive date</Label>
                <Input
                  id="drive-date"
                  type="date"
                  value={driveDate}
                  onChange={(e) => setDriveDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="start-time">Start time</Label>
                <Input
                  id="start-time"
                  type="time"
                  value={driveStartTime}
                  onChange={(e) => setDriveStartTime(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="end-time">End time</Label>
                <Input
                  id="end-time"
                  type="time"
                  value={driveEndTime}
                  onChange={(e) => setDriveEndTime(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="venue">Venue</Label>
                <Input
                  id="venue"
                  value={venueLabel}
                  onChange={(e) => setVenueLabel(e.target.value)}
                  placeholder="e.g. KEC Main Auditorium"
                />
              </div>
              <div>
                <Label htmlFor="rounds">Rounds count</Label>
                <Input
                  id="rounds"
                  type="number"
                  min={1}
                  max={10}
                  value={roundsCount}
                  onChange={(e) => setRoundsCount(parseInt(e.target.value, 10) || 1)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Offer details (optional)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label htmlFor="package">Expected package (LPA)</Label>
                <Input
                  id="package"
                  type="number"
                  step="0.1"
                  min={0}
                  value={expectedPackage}
                  onChange={(e) => setExpectedPackage(e.target.value)}
                  placeholder="e.g. 6.5"
                />
              </div>
              <div>
                <Label htmlFor="role">Job role</Label>
                <Input
                  id="role"
                  value={jobRoleTitle}
                  onChange={(e) => setJobRoleTitle(e.target.value)}
                  placeholder="e.g. Software Engineer"
                />
              </div>
              <div>
                <Label htmlFor="location">Job location</Label>
                <Input
                  id="location"
                  value={jobLocation}
                  onChange={(e) => setJobLocation(e.target.value)}
                  placeholder="e.g. Bangalore"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {submitError ? (
          <div className="text-sm text-destructive border border-destructive/30 bg-destructive/5 rounded-md p-3">
            {submitError}
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={createDrive.isPending}>
            {createDrive.isPending ? 'Creating…' : 'Create Drive'}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/cdc/drives">Cancel</Link>
          </Button>
        </div>
      </form>
    </ContentLayout>
    </PermissionGuard>
  );
}
