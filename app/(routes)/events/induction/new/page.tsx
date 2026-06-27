'use client';

// Dedicated induction creator — the events wizard (/events/create) routes here
// for format='induction' (carrying ?name=&home=), mirroring how 'tournament'
// routes to /events/tournament/new to seed its special tables. Here we seed the
// events row (event_type='induction') + the induction_programs satellite via
// InductionService.createProgram. Reachable directly from /events/induction too.
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { InductionService } from '@/lib/services/induction/induction-service';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Rocket } from 'lucide-react';

interface Institution { id: string; name: string; }
interface AcademicYear { id: string; academic_year_name: string; }

const supabase = createClientSupabaseClient();

function NewInductionForm() {
  const router = useRouter();
  const search = useSearchParams();

  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState(search.get('name') ?? '');
  const [institutionId, setInstitutionId] = useState('');
  const [academicYearId, setAcademicYearId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [venue, setVenue] = useState('');

  useEffect(() => {
    supabase.from('institutions').select('id,name').order('name')
      .then(({ data }) => setInstitutions((data as any) ?? []));
  }, []);

  useEffect(() => {
    if (!institutionId) { setYears([]); setAcademicYearId(''); return; }
    supabase.from('academic_years').select('id,academic_year_name')
      .eq('institution_id', institutionId).order('start_date', { ascending: false })
      .then(({ data }) => setYears((data as any) ?? []));
  }, [institutionId]);

  const handleCreate = async () => {
    if (!name.trim() || !institutionId) {
      toast.error('Name and institution are required.');
      return;
    }
    setCreating(true);
    try {
      const eventId = await InductionService.createProgram({
        institutionId,
        academicYearId: academicYearId || null,
        name: name.trim(),
        startDate: startDate || new Date().toISOString(),
        endDate: endDate || startDate || new Date().toISOString(),
        venueText: venue || 'Campus',
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

      <div className="max-w-xl space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1 flex items-center gap-2">
            <Rocket className="h-6 w-6 text-primary" /> New induction
          </h1>
          <p className="text-sm text-muted-foreground">
            Set up this year&apos;s induction for one college. You&apos;ll add sessions and
            enroll freshers on the next screen.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
            <CardDescription>The academic year is the joining cohort — auto-enroll uses it to find this year&apos;s freshers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ind-name">Name</Label>
              <Input id="ind-name" placeholder="e.g. Arts &amp; Science Induction 2026"
                value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Institution</Label>
              <Select value={institutionId} onValueChange={setInstitutionId}>
                <SelectTrigger><SelectValue placeholder="Select a college" /></SelectTrigger>
                <SelectContent>
                  {institutions.map((i) => (
                    <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Academic year (the joining cohort)</Label>
              <Select value={academicYearId} onValueChange={setAcademicYearId} disabled={!institutionId}>
                <SelectTrigger>
                  <SelectValue placeholder={institutionId ? 'Select year' : 'Pick a college first'} />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y.id} value={y.id}>{y.academic_year_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Label htmlFor="ind-venue">Main venue (optional)</Label>
              <Input id="ind-venue" placeholder="e.g. Vibrant Arangam" value={venue} onChange={(e) => setVenue(e.target.value)} />
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
