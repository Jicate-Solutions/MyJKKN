'use client';

// Dedicated induction creator — the events wizard (/events/create) routes here
// for format='induction' (carrying ?name=&home=), mirroring how 'tournament'
// routes to /events/tournament/new to seed its special tables. Here we seed the
// events row (event_type='induction') + the induction_programs satellite via
// InductionService.createProgram. Reachable directly from /events/induction too.
//
// Multi-institution targeting: pick one or more owning institutions, an optional
// subset of degrees, and an optional subset of departments. The joining cohort is
// identified by admission year (from the admission-year module via
// useGroupAdmissionYears). The main venue is a Resource-Management room
// (VenueRoomPicker). No academic year — enrollment is driven by admission year.
// Spec: specs/pre-onboarding-induction-access-2026-06-29.md
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { InductionService, type PreviewEnrollResult } from '@/lib/services/induction/induction-service';
import { useGroupAdmissionYears } from '@/hooks/admission/use-group-admission-years';
import { VenueRoomPicker } from '@/components/events/venue/venue-room-picker';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Rocket, Eye, Loader2, Users, AlertTriangle } from 'lucide-react';
import { MultiSelectPopover } from './_components/multi-select-popover';

interface Institution { id: string; name: string; }

const supabase = createClientSupabaseClient();

function NewInductionForm() {
  const router = useRouter();
  const search = useSearchParams();

  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState(search.get('name') ?? '');
  const [institutionIds, setInstitutionIds] = useState<string[]>([]);
  const [degreeIds, setDegreeIds] = useState<string[]>([]);
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);
  const [degrees, setDegrees] = useState<{ id: string; name: string }[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [venueResourceId, setVenueResourceId] = useState('');
  const [venueCustom, setVenueCustom] = useState('');
  const [admissionYear, setAdmissionYear] = useState('');

  // Preview-before-enroll: who WOULD be enrolled for the chosen scope. Cleared
  // whenever the scope changes so a stale preview can't mislead the Confirm.
  const [preview, setPreview] = useState<PreviewEnrollResult | null>(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    supabase.from('institutions').select('id,name').order('name')
      .then(({ data, error }) => {
        if (error) { toast.error(`Couldn't load institutions: ${error.message}`); }
        setInstitutions((data as any) ?? []);
      });
  }, []);

  // Admission years across the selected institutions (hook already takes an array).
  const { data: admissionYearOptions = [], isLoading: yearsLoading } =
    useGroupAdmissionYears(institutionIds.length ? institutionIds : []);

  // Keep the selected year valid as the option set changes (institution selection).
  useEffect(() => {
    if (!admissionYearOptions.length) return;
    setAdmissionYear((prev) =>
      prev && admissionYearOptions.some((o) => String(o.programStartYear) === prev)
        ? prev
        : String(admissionYearOptions[0].programStartYear),
    );
  }, [admissionYearOptions]);

  // Cascade: load degrees/departments for selected institutions.
  useEffect(() => {
    if (!institutionIds.length) { setDegrees([]); setDepartments([]); return; }
    supabase.from('degrees').select('id,degree_name').in('institution_id', institutionIds).order('degree_name')
      .then(({ data, error }) => {
        if (error) { toast.error(`Couldn't load degrees: ${error.message}`); }
        setDegrees((data ?? []).map((d: any) => ({ id: d.id, name: d.degree_name })));
      });
    supabase.from('departments').select('id,department_name').in('institution_id', institutionIds).order('department_name')
      .then(({ data, error }) => {
        if (error) { toast.error(`Couldn't load departments: ${error.message}`); }
        setDepartments((data ?? []).map((d: any) => ({ id: d.id, name: d.department_name })));
      });
  }, [institutionIds]);

  // Prune degree/department picks whose institution was deselected.
  useEffect(() => { setDegreeIds((p) => p.filter((id) => degrees.some((d) => d.id === id))); }, [degrees]);
  useEffect(() => { setDepartmentIds((p) => p.filter((id) => departments.some((d) => d.id === id))); }, [departments]);

  // Invalidate preview on any targeting change.
  useEffect(() => { setPreview(null); }, [institutionIds, admissionYear, degreeIds, departmentIds]);

  const yearPickerDisabled = !institutionIds.length;

  const canPreview = institutionIds.length > 0 && !!admissionYear;

  const handlePreview = async () => {
    if (!canPreview) {
      toast.error('Pick at least one institution and an admission year first.');
      return;
    }
    setPreviewing(true);
    try {
      const res = await InductionService.previewEnroll({
        institutionId: institutionIds[0] ?? null,
        admissionYear: Number(admissionYear),
        institutionIds,
        degreeIds: degreeIds.length ? degreeIds : undefined,
        departmentIds: departmentIds.length ? departmentIds : undefined,
      });
      setPreview(res);
      if (res.total === 0) toast.warning('This scope matches 0 learners — check the filters.');
    } catch (e: any) {
      toast.error(`Couldn't preview: ${e.message ?? e}`);
    } finally {
      setPreviewing(false);
    }
  };

  const handleCreate = async () => {
    if (!name.trim() || !institutionIds.length) {
      toast.error('Name and at least one institution are required.');
      return;
    }
    if (!admissionYear) {
      toast.error('Pick the admission year (the cohort to enroll).');
      return;
    }
    setCreating(true);
    try {
      const eventId = await InductionService.createProgram({
        institutionId: institutionIds[0] ?? null,
        institutionIds,
        academicYearId: null,
        name: name.trim(),
        startDate: startDate || new Date().toISOString(),
        endDate: endDate || startDate || new Date().toISOString(),
        // Resource-Management room when picked; otherwise the custom place text.
        venueResourceId: venueResourceId || null,
        venueText: venueResourceId ? null : (venueCustom.trim() || null),
        admissionYear: Number(admissionYear),
        degreeIds: degreeIds.length ? degreeIds : undefined,
        departmentIds: departmentIds.length ? departmentIds : undefined,
      });
      toast.success('Induction created.');
      router.push(`/events/induction/${eventId}`);
    } catch (e: any) {
      toast.error(`Couldn't create induction: ${e.message ?? e}`);
      setCreating(false);
    }
  };

  return (
    <ContentLayout title="New induction">
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Events', href: '/events' },
        { label: 'Induction', href: '/events/induction' },
        { label: 'New' },
      ]} />

      <div className="max-w-full space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1 flex items-center gap-2">
            <Rocket className="h-6 w-6 text-primary" /> New induction
          </h1>
          <p className="text-sm text-muted-foreground">
            Set up this year&apos;s induction. You&apos;ll add sessions and review enrolled
            freshers on the next screen.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
            <CardDescription>Auto-enroll uses the <strong>admission year</strong> (the joining cohort) to find this year&apos;s freshers — across all selected colleges for a multi-institution induction.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ind-name">Name</Label>
              <Input id="ind-name" placeholder="e.g. Fresher Induction 2026"
                value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Institutions <span className="text-destructive text-xs">*</span></Label>
              <MultiSelectPopover
                options={institutions}
                value={institutionIds}
                onChange={setInstitutionIds}
                placeholder="Select institutions"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Admission year (cohort to enroll)</Label>
                <Select value={admissionYear} onValueChange={setAdmissionYear} disabled={yearPickerDisabled}>
                  <SelectTrigger>
                    <SelectValue placeholder={
                      yearPickerDisabled ? 'Pick a college first'
                        : yearsLoading ? 'Loading…'
                        : admissionYearOptions.length ? 'Select year' : 'No admission years'
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {admissionYearOptions.map((o) => (
                      <SelectItem key={o.programStartYear} value={String(o.programStartYear)}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Degrees <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <MultiSelectPopover
                  options={degrees}
                  value={degreeIds}
                  onChange={setDegreeIds}
                  placeholder="All degrees"
                  disabled={!institutionIds.length}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Departments <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <MultiSelectPopover
                  options={departments}
                  value={departmentIds}
                  onChange={setDepartmentIds}
                  placeholder="All departments"
                  disabled={!institutionIds.length}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-1">
              Auto-enroll adds reserved, admitted &amp; account learners of the chosen admission
              year{institutionIds.length > 1 ? ` across ${institutionIds.length} colleges` : ''}.
              {degreeIds.length > 0 ? ` Restricted to ${degreeIds.length} selected degree(s).` : ''}
              {departmentIds.length > 0 ? ` Restricted to ${departmentIds.length} selected department(s).` : ''}
            </p>

            {/* Preview-before-enroll: see exactly who the scope matches before creating. */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Users className="h-4 w-4 text-primary" /> Preview who will be enrolled
                </div>
                <Button type="button" variant="outline" size="sm" onClick={handlePreview} disabled={!canPreview || previewing}>
                  {previewing ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Checking…</> : <><Eye className="h-3.5 w-3.5 mr-1.5" /> Preview</>}
                </Button>
              </div>
              {!preview && (
                <p className="text-xs text-muted-foreground">
                  Run a preview to confirm the matched freshers before creating — this catches a
                  wrong scope (extra colleges, or PG mixed into a UG induction) before anyone is enrolled.
                </p>
              )}
              {preview && (
                <div className="space-y-2">
                  <div className={`flex items-center gap-2 text-sm font-semibold ${preview.total === 0 ? 'text-destructive' : ''}`}>
                    {preview.total === 0 && <AlertTriangle className="h-4 w-4" />}
                    {preview.total} learner{preview.total === 1 ? '' : 's'} match this scope
                  </div>
                  {preview.by_program.length > 0 && (
                    <div className="text-xs">
                      <div className="text-muted-foreground mb-1">By program:</div>
                      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                        {preview.by_program.map((p, i) => (
                          <li key={i} className="flex justify-between gap-2 tabular-nums">
                            <span className="truncate">{p.program} <span className="uppercase text-muted-foreground">[{p.degree_type ?? '—'}]</span></span>
                            <span className="font-medium">{p.count}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {preview.by_department && preview.by_department.length > 0 && (
                    <div className="text-xs">
                      <div className="text-muted-foreground mb-1">By department:</div>
                      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                        {preview.by_department.map((d, i) => (
                          <li key={i} className="flex justify-between gap-2 tabular-nums">
                            <span className="truncate">{d.department}</span>
                            <span className="font-medium">{d.count}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {preview.by_institution.length > 1 && (
                    <div className="text-xs">
                      <div className="text-muted-foreground mb-1">By college:</div>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ind-start">Start date</Label>
                <Input id="ind-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ind-end">End date</Label>
                <Input id="ind-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Main venue (optional)</Label>
              <VenueRoomPicker value={venueResourceId} onChange={setVenueResourceId} />
              {!venueResourceId && (
                <Input
                  placeholder="Or type a custom place (off-campus)"
                  value={venueCustom}
                  onChange={(e) => setVenueCustom(e.target.value)}
                />
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => router.push('/events/induction')} disabled={creating}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? 'Creating…' : 'Create induction'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}

export default function NewInductionPage() {
  return (
    <Suspense fallback={<ContentLayout title="New induction"><p className="text-sm text-muted-foreground mt-4">Loading…</p></ContentLayout>}>
      <NewInductionForm />
    </Suspense>
  );
}
