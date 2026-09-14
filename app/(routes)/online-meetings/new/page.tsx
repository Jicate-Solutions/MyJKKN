/**
 * Online Meetings — schedule a meeting.
 *
 * Route: /online-meetings/new. Gated on onlineMeeting:create server-side, and
 * again by the INSERT policy in the database. The check here exists so the
 * person gets a sentence instead of a failed save.
 *
 * The institution list comes from the caller's accessible institutions, not
 * from a branch on super-admin. Branching on isSuperAdmin to decide scope is
 * how secondary roles with `scope='all'` silently lose access; RLS still gates
 * the rows either way.
 */

import Link from 'next/link';
import { AlertCircle, Lock } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { isTeamsConfigured } from '@/lib/services/online-meetings/meet-provisioner';
import { createClient } from '@/lib/supabase/server';

import { MeetingForm } from './_components/meeting-form';

export const dynamic = 'force-dynamic';

export const navMeta = { label: 'Schedule a Team Meeting', icon: 'CalendarPlus' };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <ContentLayout title="Schedule a Team Meeting">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Online Meetings', href: '/online-meetings' },
          { label: 'Schedule' },
        ]}
      />
      <div className="mt-4 space-y-4">{children}</div>
    </ContentLayout>
  );
}

export default async function NewOnlineMeetingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Shell>
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground/50" aria-hidden />
            <h3 className="text-sm font-medium">You are not signed in</h3>
            <Link href="/auth/login" className="mt-2 inline-flex">
              <Button size="sm">Sign in</Button>
            </Link>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const { data: canCreate } = await supabase.rpc('user_has_permission', {
    permission_name: 'onlineMeeting:create',
  });

  if (canCreate !== true) {
    return (
      <Shell>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Lock className="h-8 w-8 text-muted-foreground/50" aria-hidden />
            <p className="text-sm font-medium">
              You cannot schedule an online meeting yet
            </p>
            <p className="max-w-md text-xs text-muted-foreground">
              Ask your MyJKKN administrator for the &ldquo;Schedule an online
              meeting&rdquo; permission
              (<code className="rounded bg-muted px-1">onlineMeeting:create</code>).
              You can still open meetings you were invited to.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/online-meetings">Back to meetings</Link>
            </Button>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  // The caller's own institution first, then anything else RLS lets them read.
  // Not a super-admin branch — see the file header.
  const [{ data: profile }, { data: institutions }] = await Promise.all([
    supabase.from('profiles').select('institution_id').eq('id', user.id).maybeSingle(),
    supabase
      .from('institutions')
      .select('id, name')
      .eq('is_active', true)
      .order('name'),
  ]);

  const options = ((institutions ?? []) as Array<{ id: string; name: string }>).map(
    (i) => ({ id: i.id, name: i.name }),
  );

  // Which link providers are usable on this deployment. Checked here so the
  // form can name the missing piece instead of silently producing a meeting
  // with no link. Teams is the default and is checked in the form itself,
  // since Graph is env-gated rather than per-host.
  const { data: googleConnection } = await supabase
    .from('meeting_host_google_connections')
    .select('status')
    .eq('host_profile_id', user.id)
    .maybeSingle();

  return (
    <Shell>
      <PageHeader
        title="Schedule a team meeting"
        description="Pick a time, decide what you want to measure, and invite colleagues or outside guests. Guests need no MyJKKN account — they get a personal link."
      />
      <MeetingForm
        institutions={options}
        defaultInstitutionId={profile?.institution_id ?? options[0]?.id ?? ''}
        googleConnected={googleConnection?.status === 'active'}
        teamsConfigured={isTeamsConfigured()}
      />
    </Shell>
  );
}
