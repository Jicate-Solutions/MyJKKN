'use client';

// Induction — list of inductions (RLS-scoped). Creation goes through the events
// module's flow: the "Create induction" button opens the dedicated creator
// (/events/induction/new), which the /events/create wizard also routes to for
// format='induction'. No bespoke create dialog here.
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Rocket, CalendarDays, Building2 } from 'lucide-react';
import { toast } from 'sonner';

interface InductionRow {
  id: string;
  name: string;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  institution_id: string;
  institutions?: { name: string } | null;
}

const supabase = createClientSupabaseClient();

export default function InductionLandingPage() {
  const [rows, setRows] = useState<InductionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
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

  useEffect(() => { load(); }, [load]);

  return (
    <ContentLayout title="Induction">
      <PageBreadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Events', href: '/events' }, { label: 'Induction' }]} />

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
          <Button asChild>
            <Link href="/events/induction/new"><Plus className="h-4 w-4 mr-1" /> Create induction</Link>
          </Button>
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
              <Link key={r.id} href={`/events/induction/${r.id}`} className="block">
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
