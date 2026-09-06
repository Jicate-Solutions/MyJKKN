// app/(routes)/ai-pulse/submit/publication/page.tsx
// ============================================================================
// AI Pulse — Publication submission (SOP Phase V).
//
// Surface: /ai-pulse/submit/publication?cycle=<uuid|current>
// Learner pastes their team's Instagram post link (department account) +
// optional GitHub repo; the API verifies the post against ig_posts and reads
// the latest reach snapshot.
//
// Permission gate: aiPulse:submit.publication (server-side via
// user_has_permission RPC; super_admin bypass). Deny renders an explicit
// "You don't have access" state — never a silent redirect (rule #27).
//
// Pattern reference: app/(routes)/ai-pulse/my-pulse/page.tsx (server gate)
// + app/(routes)/ai-pulse/live/[cycle]/page.tsx (explicit deny UI).
// ============================================================================

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Lock, ArrowLeft } from 'lucide-react';

import { createClient, getEnhancedUserProfile } from '@/lib/supabase/server';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import { PublicationSubmitForm } from './_components/publication-submit-form';

export const dynamic = 'force-dynamic';

const PERMISSION_KEY = 'aiPulse:submit.publication';

async function checkPermission(key: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('user_has_permission', {
      permission_name: key,
    });
    if (error) {
      console.error(
        `[ai-pulse/submit/publication] user_has_permission(${key}) failed:`,
        error
      );
      return false;
    }
    return data === true;
  } catch (e) {
    console.error(
      `[ai-pulse/submit/publication] permission check threw for ${key}:`,
      e
    );
    return false;
  }
}

interface PageProps {
  searchParams: Promise<{ cycle?: string }>;
}

export default async function PublicationSubmitPage({ searchParams }: PageProps) {
  const { cycle } = await searchParams;
  const { profile } = await getEnhancedUserProfile();

  if (!profile) {
    redirect('/auth/login?next=/ai-pulse/submit/publication');
  }

  const allowed =
    profile.is_super_admin === true || (await checkPermission(PERMISSION_KEY));

  if (!allowed) {
    return (
      <ContentLayout title="Submit Publication">
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
            <Lock className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="font-medium">
              You don&apos;t have access to publication submissions.
            </p>
            <p className="text-sm text-muted-foreground max-w-md">
              Publication entries are for enrolled AI Pulse learners. If you
              believe this is a mistake, ask your Class Incharge or AI Pulse
              Champion to grant the{' '}
              <code className="bg-muted px-1 rounded">{PERMISSION_KEY}</code>{' '}
              permission.
            </p>
            <Button asChild variant="outline" className="gap-2">
              <Link href="/ai-pulse/my-pulse">
                <ArrowLeft className="h-4 w-4" />
                Back to My Pulse
              </Link>
            </Button>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Submit Publication">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'AI Pulse', href: '/ai-pulse' },
          { label: 'My Pulse', href: '/ai-pulse/my-pulse' },
          { label: 'Submit Publication' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Submit Publication</h1>
          <p className="text-sm text-muted-foreground">
            Paste your team&apos;s Instagram post (department account) and
            optional GitHub repo for this cycle. We verify the post and track
            its reach automatically.
          </p>
        </div>

        <PublicationSubmitForm cycleParam={cycle || 'current'} />
      </div>
    </ContentLayout>
  );
}
