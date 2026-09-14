// app/(routes)/instasolver/broken/page.tsx
//
// InstaSolver — "something is broken", the report screen.
//
// Decision I1 (Director, 2026-09-14, specs/instasolver-2026-09-14.md):
// everyone with a login can report a broken thing. In practice, on this route,
// that means every role in the STAFF auth flow — learners, teaching and
// non-teaching staff. It does NOT yet include parents: the Parent Portal is a
// separate login domain (proxy.ts `handleParentPortal`, a `parent_session` JWT,
// and only `/parent/*` paths), so a parent who opens this URL is bounced to
// /auth/login by the staff flow. A `/parent/…` entry point is a follow-up lane,
// not something this page can reach.
//
// Decision I4 sends what they report into Campus Walk's fix lane
// (`project_tasks` under CAMPUS-OPS), never into `grievance_tickets` — a broken
// fan must not land in a NAAC or UGC return.
//
// This wrapper deliberately carries NO role gate. Campus Walk's own capture
// screen is Director-only (D2, `isCampusWalkReporter`) and stays that way;
// this front door is the opposite by design, so the only check here is "are
// you signed in", mirroring that page's structure and its rule-#27 explicit
// refusal card rather than a silent redirect.
//
// Until #3743 maps it, this route is UNMAPPED — and an unmapped route is OPEN,
// not closed: `RouteMatcher.hasAccess` (lib/auth/route-matcher.ts) returns
// `true` when `match(path)` finds no config, so every authenticated
// staff-flow role can already reach this page. That is consistent with
// decision I1 — the sidebar entry and `MENU_PERMISSIONS['/instasolver/broken']`
// make the access explicit rather than granting it. Nothing here needs to
// change when that lands.

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
