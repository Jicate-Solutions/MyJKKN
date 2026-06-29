'use client';

// Dedicated induction creator — the events wizard (/events/create) routes here
// for format='induction' (carrying ?name=&home=), mirroring how 'tournament'
// routes to /events/tournament/new to seed its special tables. Here we seed the
// events row (event_type='induction') + the induction_programs satellite via
// InductionService.createProgram. Reachable directly from /events/induction too.
//
// Institution-wise + admission-year based: pick the owning institution, the
// cohort admission YEAR (from the admission-year module via useGroupAdmissionYears),
// and whether to enroll only this college or all colleges (group). The main venue
// is a Resource-Management room (VenueRoomPicker). No academic year — enrollment
// is driven by admission year. Spec: specs/pre-onboarding-induction-access-2026-06-29.md
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { InductionService } from '@/lib/services/induction/induction-service';
import { useGroupAdmissionYears } from '@/hooks/admission/use-group-admission-years';
import { VenueRoomPicker } from '@/components/events/venue/venue-room-picker';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Rocket } from 'lucide-react';

interface Institution { id: string; name: string; }

const supabase = createClientSupabaseClient();

function NewInductionForm() {
  const router = useRouter();
  const search = useSearchParams();

  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState(search.get('name') ?? '');
  const [institutionId, setInstitutionId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [venueResourceId, setVenueResourceId] = useState('');
  const [venueCustom, setVenueCustom] = useState('');
  const [admissionYear, setAdmissionYear] = useState('');
  const [enrollScope, setEnrollScope] = useState<'institution' | 'group'>('institution');

  useEffect(() => {
    supabase.from('institutions').select('id,name').order('name')
      .then(({ data }) => setInstitutions((data as any) ?? []));
  }, []);

  // Admission years from the admission-year module. Scope follows the enroll
  // choice: "this college only" → the selected institution's cohorts; "all
  // colleges" → every institution's cohorts (deduped by year). Stores the YEAR int.
  const yearScopeIds = useMemo<string[] | null>(
    () => (enrollScope === 'group' ? null : institutionId ? [institutionId] : []),
    [enrollScope, institutionId],
  );
  const { data: admissionYearOptions = [], isLoading: yearsLoading } =
    useGroupAdmissionYears(yearScopeIds);

  // Keep the selected year valid as the option set changes (scope/institution).
  useEffect(() => {
    if (!admissionYearOptions.length) return;
    setAdmissionYear((prev) =>
      prev && admissionYearOptions.some((o) => String(o.programStartYear) === prev)
        ? prev
        : String(admissionYearOptions[0].programStartYear),
    );
  }, [admissionYearOptions]);

  const yearPickerDisabled = enrollScope === 'institution' && !institutionId;

  const handleCreate = async () => {
    if (!name.trim() || !institutionId) {
      toast.error('Name and institution are required.');
      return;
    }
    if (!admissionYear) {
      toast.error('Pick the admission year (the cohort to enroll).');
      return;
    }
    setCreating(true);
    try {
      const eventId = await InductionService.createProgram({
        institutionId,
        academicYearId: null,
        name: name.trim(),
        startDate: startDate || new Date().toISOString(),
        endDate: endDate || startDate || new Date().toISOString(),
        // Resource-Management room when picked; otherwise the custom place text.
        venueResourceId: venueResourceId || null,
        venueText: venueResourceId ? null : (venueCustom.trim() || null),
        admissionYear: Number(admissionYear),
        enrollScope,
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
            <CardDescription>Auto-enroll uses the <strong>admission year</strong> (the joining cohort) to find this year&apos;s freshers — across all colleges for a group induction.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ind-name">Name</Label>
              <Input id="ind-name" placeholder="e.g. Fresher Induction 2026"
                value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Institution</Label>
              <Select value={institutionId} onValueChange={setInstitutionId}>
                <SelectTrigger><SelectValue placeholder="Select an institution" /></SelectTrigger>
                <SelectContent>
                  {institutions.map((i) => (
                    <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
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
                <Label>Enroll</Label>
                <Select value={enrollScope} onValueChange={(v) => setEnrollScope(v as 'institution' | 'group')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="institution">This college only</SelectItem>
                    <SelectItem value="group">All colleges (group)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-1">
              Auto-enroll adds reserved, admitted &amp; account learners of the chosen admission
              year{enrollScope === 'group' ? ' across every college' : ' in the selected college'}.
            </p>
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
