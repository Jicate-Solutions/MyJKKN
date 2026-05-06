/**
 * AI Pulse landing page (re-glue PR — restores the surface PR #728 reverted).
 *
 * Lists upcoming/recent AI Pulse cycles by querying `startup_events` filtered
 * by `config->>'kind' = 'ai_pulse'`. Defensively returns empty state if the
 * column / filter returns nothing — no hard dependency on the AI Pulse
 * substrate migration being applied yet.
 *
 * Permission gate is page-level: any authenticated user can land here. Sidebar
 * entry (lib/sidebarMenuLink.ts) is mapped to `view_profile` (universal
 * authenticated key, same pattern as /meetings/inbox). Once PR #747 lands the
 * `aiPulse:view.self` key, the sidebar entry should be re-mapped in a
 * follow-up.
 *
 * Champion Console (/ai-pulse/admin/cycles) and My Pulse (/ai-pulse/my-pulse)
 * links render unconditionally as `<a href>`s — those routes ship in #732 /
 * #729 and 404 until merged. Acceptable: this is a re-glue, not a feature
 * rollout.
 */
export const dynamic = 'force-dynamic';

import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Activity, Calendar, Settings, User } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'AI Pulse',
  description: 'AI Pulse cycles — institutional AI literacy program',
};

interface AiPulseCycle {
  id: string;
  name: string;
  description: string | null;
  start_date: string | null;
  status: string;
}

export default async function AiPulseLandingPage() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const isSuperAdmin = profile?.role === 'super_admin';

  // Defensive query — if the AI Pulse substrate isn't merged, this returns []
  // gracefully rather than throwing.
  let cycles: AiPulseCycle[] = [];
  try {
    const { data, error } = await supabase
      .from('startup_events')
      .select('id, name, description, start_date, status')
      .filter('config->>kind', 'eq', 'ai_pulse')
      .order('start_date', { ascending: false })
      .limit(5);

    if (!error && data) {
      cycles = data as AiPulseCycle[];
    }
  } catch {
    // Substrate not present yet — fall through to empty state.
    cycles = [];
  }

  return (
    <ContentLayout title="AI Pulse">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'AI Pulse' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold py-1 flex items-center gap-2">
              <Activity className="h-6 w-6" />
              AI Pulse
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Institutional AI literacy cycles — track competitions, scoring,
              and demo days.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button asChild variant="outline" size="sm">
              <Link href="/ai-pulse/my-pulse">
                <User className="h-4 w-4 mr-1.5" />
                My Pulse
              </Link>
            </Button>
            {isSuperAdmin && (
              <Button asChild size="sm">
                <Link href="/ai-pulse/admin/cycles">
                  <Settings className="h-4 w-4 mr-1.5" />
                  Champion Console
                </Link>
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Recent &amp; Upcoming Cycles
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cycles.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                AI Pulse cycles will appear once the program launches.
              </p>
            ) : (
              <ul className="divide-y">
                {cycles.map((cycle) => (
                  <li key={cycle.id} className="py-3 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{cycle.name}</div>
                      {cycle.description && (
                        <div className="text-sm text-muted-foreground line-clamp-2">
                          {cycle.description}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground mt-1">
                        {cycle.start_date
                          ? new Date(cycle.start_date).toLocaleDateString()
                          : 'Date TBD'}
                        <span className="mx-1.5">·</span>
                        <span className="capitalize">{cycle.status}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
