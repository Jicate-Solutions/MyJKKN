'use client';

// Induction — module landing: list inductions + create a new one.
// Create flows through InductionService.createProgram (SECURITY DEFINER RPC).
// Reads are RLS-scoped via the browser supabase client.
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { InductionService } from '@/lib/services/induction/induction-service';
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Rocket, CalendarDays, Building2 } from 'lucide-react';

interface InductionRow {
  id: string;
  name: string;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  institution_id: string;
  institutions?: { name: string } | null;
}
interface Institution { id: string; name: string; }
interface AcademicYear { id: string; academic_year_name: string; }

const supabase = createClientSupabaseClient();

export default function InductionLandingPage() {
  const router = useRouter();
  const [rows, setRows] = useState<InductionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [creating, setCreating] = useState(false);

  // create-form fields
  const [name, setName] = useState('');
  const [institutionId, setInstitutionId] = useState('');
  const [academicYearId, setAcademicYearId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [venue, setVenue] = useState('');

  const loadInductions = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('events')
      .select('id,name,status,start_date,end_date,institution_id,institutions(name)')
      .eq('event_type', 'induction')
      .order('start_date', { ascending: false });
    if (error) toast.error(`Couldn't load inductions: ${error.message}`);
    setRows((data as any) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadInductions();
    supabase.from('institutions').select('id,name').order('name').then(({ data }) => {
      setInstitutions((data as any) ?? []);
    });
  }, [loadInductions]);

  // load academic years when institution changes
  useEffect(() => {
    if (!institutionId) { setYears([]); setAcademicYearId(''); return; }
    supabase
      .from('academic_years')
      .select('id,academic_year_name')
      .eq('institution_id', institutionId)
      .order('start_date', { ascending: false })
      .then(({ data }) => setYears((data as any) ?? []));
  }, [institutionId]);

  const resetForm = () => {
    setName(''); setInstitutionId(''); setAcademicYearId('');
    setStartDate(''); setEndDate(''); setVenue('');
  };

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
      setOpen(false);
      resetForm();
      router.push(`/induction/${eventId}`);
    } catch (e: any) {
      toast.error(`Couldn't create induction: ${e.message ?? e}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <ContentLayout title="Induction">
      <PageBreadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Induction' }]} />

      <div className="space-y-6 mt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold py-1 flex items-center gap-2">
              <Rocket className="h-6 w-6 text-primary" /> Fresher Induction
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Run each college&apos;s induction as a guided program. Create one, auto-enroll
              this year&apos;s freshers, and split them into batches — then track who completes
              and who turns into a referral that joins.
            </p>
          </div>

          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1" /> Create induction</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create induction</DialogTitle>
                <DialogDescription>
                  Set up this year&apos;s induction for one college. You&apos;ll add sessions and
                  enroll freshers on the next screen.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 py-2">
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
                  <Select value={academicYearId} onValueChange={setAcademicYearId}
                    disabled={!institutionId}>
                    <SelectTrigger>
                      <SelectValue placeholder={institutionId ? 'Select year' : 'Pick a college first'} />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map((y) => (
                        <SelectItem key={y.id} value={y.id}>{y.academic_year_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Auto-enroll uses this to find the freshers who joined this year.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ind-start">Start date</Label>
                    <Input id="ind-start" type="date" value={startDate}
                      onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ind-end">End date</Label>
                    <Input id="ind-end" type="date" value={endDate}
                      onChange={(e) => setEndDate(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ind-venue">Main venue (optional)</Label>
                  <Input id="ind-venue" placeholder="e.g. Vibrant Arangam"
                    value={venue} onChange={(e) => setVenue(e.target.value)} />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={creating}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={creating}>
                  {creating ? 'Creating…' : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading inductions…</p>
        ) : rows.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No inductions yet</CardTitle>
              <CardDescription>
                Create the first one. After that, other colleges can copy it as a starting point.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => (
              <Link key={r.id} href={`/induction/${r.id}`} className="block">
                <Card className="h-full transition-colors hover:border-primary">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base">{r.name}</CardTitle>
                      <Badge variant={r.status === 'live' ? 'default' : 'secondary'}>
                        {r.status ?? 'draft'}
                      </Badge>
                    </div>
                    <CardDescription className="space-y-1 pt-1">
                      <span className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5" />
                        {r.institutions?.name ?? 'Unknown college'}
                      </span>
                      {r.start_date && (
                        <span className="flex items-center gap-1.5">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {new Date(r.start_date).toLocaleDateString()}
                          {r.end_date ? ` – ${new Date(r.end_date).toLocaleDateString()}` : ''}
                        </span>
                      )}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
