'use client';

// Induction detail — the cohort engine: auto-enroll the joining cohort, then
// auto-split into batches by department. Live counts form the funnel. Actions
// call the SECURITY DEFINER RPCs via InductionService.
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
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
import { Users, Layers, Building2, CalendarDays, UserPlus, Split } from 'lucide-react';

interface EventRow {
  id: string; name: string; status: string | null;
  start_date: string | null; end_date: string | null;
  institution_id: string; institutions?: { name: string } | null;
}
interface BatchCount { id: string; label: string; count: number; }

const supabase = createClientSupabaseClient();

export default function InductionDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [event, setEvent] = useState<EventRow | null>(null);
  const [hasProgram, setHasProgram] = useState(false);
  const [enrolled, setEnrolled] = useState(0);
  const [batches, setBatches] = useState<BatchCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [numBatches, setNumBatches] = useState(2);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: ev }, { data: prog }, { count }, { data: batchRows }] = await Promise.all([
      supabase.from('events').select('id,name,status,start_date,end_date,institution_id,institutions(name)').eq('id', id).maybeSingle(),
      supabase.from('induction_programs').select('event_id').eq('event_id', id).maybeSingle(),
      supabase.from('induction_enrollment').select('id', { count: 'exact', head: true }).eq('event_id', id),
      supabase.from('induction_batches').select('id,label').eq('event_id', id).order('label'),
    ]);
    setEvent((ev as any) ?? null);
    setHasProgram(!!prog);
    setEnrolled(count ?? 0);

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

  const handleEnroll = async () => {
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

  return (
    <ContentLayout title={event.name}>
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Events', href: '/events' },
        { label: 'Induction', href: '/events/induction' },
        { label: event.name },
      ]} />

      <div className="space-y-6 mt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold py-1">{event.name}</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" />{event.institutions?.name ?? '—'}</span>
              {event.start_date && (
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {new Date(event.start_date).toLocaleDateString()}
                  {event.end_date ? ` – ${new Date(event.end_date).toLocaleDateString()}` : ''}
                </span>
              )}
            </div>
          </div>
          <Badge variant={event.status === 'live' ? 'default' : 'secondary'}>{event.status ?? 'draft'}</Badge>
        </div>

        {/* Signature: the cohort funnel — enrolled → batches */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cohort</CardTitle>
            <CardDescription>
              Enroll this year&apos;s freshers, then split them into batches by department
              (classmates stay together).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-stretch gap-3">
              {/* Enrolled */}
              <div className="flex-1 min-w-[160px] rounded-lg border p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Users className="h-4 w-4" /> Enrolled freshers
                </div>
                <div className="text-3xl font-bold mt-1">{enrolled}</div>
                <Button size="sm" className="mt-3" onClick={handleEnroll} disabled={enrolling}>
                  <UserPlus className="h-4 w-4 mr-1" />
                  {enrolling ? 'Enrolling…' : enrolled > 0 ? 'Re-run auto-enroll' : 'Auto-enroll freshers'}
                </Button>
              </div>

              {/* Batches */}
              <div className="flex-[2] min-w-[220px] rounded-lg border p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Layers className="h-4 w-4" /> Batches
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="numb" className="text-xs text-muted-foreground">Count</Label>
                    <Input id="numb" type="number" min={1} max={12} value={numBatches}
                      onChange={(e) => setNumBatches(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
                      className="h-8 w-16" />
                    <Button size="sm" variant="outline" onClick={handleSplit}
                      disabled={splitting || enrolled === 0}>
                      <Split className="h-4 w-4 mr-1" />
                      {splitting ? 'Splitting…' : 'Auto-split'}
                    </Button>
                  </div>
                </div>
                {batches.length === 0 ? (
                  <p className="text-sm text-muted-foreground mt-3">
                    {enrolled === 0 ? 'Enroll freshers first, then split into batches.' : 'Not split yet.'}
                  </p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {batches.map((b) => (
                      <div key={b.id} className="rounded-md bg-muted px-3 py-2 min-w-[88px]">
                        <div className="text-xs text-muted-foreground">Batch {b.label}</div>
                        <div className="text-xl font-semibold">{b.count}</div>
                      </div>
                    ))}
                    {unbatched > 0 && (
                      <div className="rounded-md border border-dashed px-3 py-2 min-w-[88px]">
                        <div className="text-xs text-muted-foreground">Unbatched</div>
                        <div className="text-xl font-semibold">{unbatched}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            {!hasProgram && (
              <p className="text-xs text-amber-600">
                This event has no induction config row — enroll/split may not work. Recreate it from the Induction page.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Sessions placeholder — authoring lands in the next slice */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sessions</CardTitle>
            <CardDescription>
              The day-by-day schedule (topics, speakers, venues, outcomes, resources) is coming
              in the next update.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </ContentLayout>
  );
}
