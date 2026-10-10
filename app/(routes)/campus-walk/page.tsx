// app/(routes)/campus-walk/page.tsx
//
// Campus Walk — capture screen.
//
// Spec: specs/campus-walk-2026-08-17.md. This screen discharges the one
// thing the spec says "genuinely does not exist" for v1: a phone-first
// capture screen — camera, one-line description, location, offline queue.
// Routing (CAMPUS-OPS project tasks) is already live in
// lib/services/campus-walk/campus-walk-service.ts; this page only captures.
//
// D2 (locked 2026-08-17): "Director only for v1 — prove routing before
// opening up." Still exactly one permitted person, but the rule now resolves
// from a configuration row via lib/campus-walk/reporters.ts rather than a
// hardcoded address compared in five separate places. Refusal renders an
// explicit "you don't have access" card, never a silent redirect (rule #27).
// The API route this screen posts to re-checks server-side — this is a fast
// UI-level gate, not the enforcement boundary.

import { AlertCircle } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { isCampusWalkReporter } from '@/lib/campus-walk/reporters';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WalkClient } from './_components/walk-client';
import { CctvForm } from './_components/cctv-form';

export const dynamic = 'force-dynamic';

export default async function CampusWalkPage({
  searchParams
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  // ?mode=cctv opens the CCTV report form first — the operator's bookmark.
  const { mode } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <ContentLayout title="Campus Walk">
        <Card className="mt-6">
          <CardContent className="flex items-start gap-3 py-6">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">You are not signed in</p>
              <p className="text-sm text-muted-foreground">Sign in to use Campus Walk.</p>
            </div>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  if (!(await isCampusWalkReporter(user.email))) {
    return (
      <ContentLayout title="Campus Walk">
        <Card className="mt-6">
          <CardContent className="flex items-start gap-3 py-6">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">You don&apos;t have access to Campus Walk</p>
              <p className="text-sm text-muted-foreground">
                Filing campus walk observations is limited to named people in this release —
                routing is being proven before it opens up to anyone else. Contact the
                Director&apos;s office if you believe you should have access.
              </p>
            </div>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Campus Walk">
      <PageBreadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Campus Walk' }]} />
      <div className="mt-4">
        <PageHeader
          title="Campus Walk"
          description="Photograph a condition. It routes itself — you just confirm where."
        />
      </div>
      <Tabs defaultValue={mode === 'cctv' ? 'cctv' : 'walk'} className="mt-4">
        <TabsList>
          <TabsTrigger value="walk">Photo on a walk</TabsTrigger>
          <TabsTrigger value="cctv">CCTV report</TabsTrigger>
        </TabsList>
        <TabsContent value="walk">
          <WalkClient />
        </TabsContent>
        <TabsContent value="cctv">
          <CctvForm />
        </TabsContent>
      </Tabs>
    </ContentLayout>
  );
}
