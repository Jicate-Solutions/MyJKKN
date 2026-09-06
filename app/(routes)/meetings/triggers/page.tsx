// app/(routes)/meetings/triggers/page.tsx
//
// PR4 — Auto-Meeting Triggers console.
//
// The Director's single place (decision #2: "Director sets all") to:
//   1. set each college's attendance threshold + switch the rule on/off, and
//   2. review breach events + judge explained ones (skip / still meet).
//
// Access gate (rule #27 — explicit 403, never a silent redirect):
//   is_super_admin OR is_admin. Director-only config.
// Data gate: service-role client reads ALL institutions (RLS would restrict to
//   the caller's own institution, hiding other colleges).
//
// Server component shell; interactivity lives in the TriggersConsole island.

import { AlertCircle } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  listTriggerRulesWithRates,
  listRecentTriggerEvents
} from '@/lib/services/meetings/meeting-trigger-service';

import { TriggersConsole } from './_components/triggers-console';

export const dynamic = 'force-dynamic';
export const navMeta = { label: 'Auto-Meetings', icon: 'CalendarClock' };

const breadcrumbItems = [
  { label: 'Home', href: '/' },
  { label: 'Meetings', href: '/meetings/inbox' },
  { label: 'Auto-Meetings' }
];

function AccessDenied() {
  return (
    <ContentLayout title="Auto-Meeting Triggers">
      <PageBreadcrumb items={breadcrumbItems} />
      <div className="mt-8 flex justify-center">
        <Card className="w-full max-w-md rounded-2xl border-neutral-200 shadow-sm">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle
              className="h-8 w-8 text-muted-foreground/50"
              aria-hidden
            />
            <h3 className="text-sm font-medium">
              You don&apos;t have access to this page
            </h3>
            <p className="text-xs text-muted-foreground">
              Auto-meeting trigger configuration is restricted to
              administrators.
            </p>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}

export default async function MeetingTriggersPage() {
  const sessionClient = await createClient();
  const {
    data: { user }
  } = await sessionClient.auth.getUser();
  if (!user) return <AccessDenied />;

  const [{ data: isSuperAdmin }, { data: isAdmin }] = await Promise.all([
    sessionClient.rpc('is_super_admin'),
    sessionClient.rpc('is_admin')
  ]);
  if (!isSuperAdmin && !isAdmin) return <AccessDenied />;

  const serviceClient = createServiceRoleClient();
  const [rules, events] = await Promise.all([
    listTriggerRulesWithRates({ client: serviceClient }),
    listRecentTriggerEvents({ client: serviceClient, limit: 30 })
  ]);

  return (
    <ContentLayout title="Auto-Meeting Triggers">
      <PageBreadcrumb items={breadcrumbItems} />
      <div className="space-y-6 mt-4">
        <PageHeader
          title="Auto-Meeting Triggers"
          description="Accountability thresholds for attendance (per college) and projects (overdue tasks + at-risk projects). When a line is crossed, the accountable person is asked to explain within 24h — otherwise it is escalated to their reporting head for a review meeting."
        />
        <TriggersConsole initialRules={rules} initialEvents={events} />
      </div>
    </ContentLayout>
  );
}
