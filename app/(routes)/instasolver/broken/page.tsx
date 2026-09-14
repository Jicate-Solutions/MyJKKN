// app/(routes)/instasolver/broken/page.tsx
//
// InstaSolver — "something is broken", the report screen.
//
// Decision I1 (Director, 2026-09-14, specs/instasolver-2026-09-14.md):
// everyone with a login can report a broken thing — learners, teaching and
// non-teaching staff, parents. Decision I4 sends what they report into Campus
// Walk's fix lane (`project_tasks` under CAMPUS-OPS), never into
// `grievance_tickets` — a broken fan must not land in a NAAC or UGC return.
//
// This wrapper deliberately carries NO role gate. Campus Walk's own capture
// screen is Director-only (D2, `isCampusWalkReporter`) and stays that way;
// this front door is the opposite by design, so the only check here is "are
// you signed in", mirroring that page's structure and its rule-#27 explicit
// refusal card rather than a silent redirect.
//
// Until the sidebar entry and `MENU_PERMISSIONS['/instasolver/broken']` land
// (a separate PR), this route is unmapped and therefore reachable only by a
// super admin — the platform's default for an unmapped route. Nothing here
// needs to change when that lands.

import { AlertCircle } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { BrokenClient } from './_components/broken-client';

export const dynamic = 'force-dynamic';

export default async function InstaSolverBrokenPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <ContentLayout title="Report something broken">
        <Card className="mt-6">
          <CardContent className="flex items-start gap-3 py-6">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">You are not signed in</p>
              <p className="text-sm text-muted-foreground">
                Sign in to report something broken.
              </p>
            </div>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Report something broken">
      <PageBreadcrumb
        items={[{ label: 'Home', href: '/' }, { label: 'Report something broken' }]}
      />
      <div className="mt-4">
        <PageHeader
          title="Report something broken"
          description="Tell us what is broken and where. It goes straight to the people who fix it."
        />
      </div>
      <BrokenClient />
    </ContentLayout>
  );
}
