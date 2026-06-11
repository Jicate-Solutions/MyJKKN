// app/(routes)/meetings/availability/page.tsx
//
// NATIVE "My Availability" page.
//
// REPLACES the old broken implementation: the previous version iframed
// jicate-booking's Cal.com availability editor (JicateBookingEmbed
// mode="availability"). That iframe renders BROKEN — a cross-origin iframe
// can't hold a Cal.com session, so it forced users into a separate Cal.com
// login we explicitly do not want.
//
// This version is first-class MyJKKN UI. It calls Cal.com's v2 REST API
// SERVER-SIDE via the per-user "Path W" vaulted API key (the key never reaches
// the browser). The weekly-hours editor is a native Shadcn UI component.
//
// Flow:
//   1. Resolve the current user (explicit "not signed in" state — never a
//      silent redirect, CLAUDE.md rule #27).
//   2. getMySchedule() — which itself ensureProvisioned()s the Cal.com account
//      and creates a default schedule if the user has none yet, so the editor
//      is never blank.
//   3. Render AvailabilityEditor, or an explicit error card on failure.
//
// Design system copied from the sibling /meetings/inbox page: ContentLayout +
// PageBreadcrumb + PageHeader + Shadcn UI, plus a small Inbox/Availability/
// Manage tab bar for navigation between the three meetings surfaces.

import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { getMySchedule } from './actions';
import { AvailabilityEditor } from './_components/availability-editor';

// Cal.com reads/writes are user-specific and mutable — never statically cache.
export const dynamic = 'force-dynamic';

const MEETINGS_TABS = [
  { key: 'inbox', label: 'Inbox', href: '/meetings/inbox' },
  { key: 'availability', label: 'My Availability', href: '/meetings/availability' },
  { key: 'manage', label: 'Manage Event Types', href: '/meetings/manage' },
] as const;

function MeetingsTabBar({ active }: { active: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {MEETINGS_TABS.map((t) => (
        <Link key={t.key} href={t.href} className="inline-flex">
          <Button variant={active === t.key ? 'default' : 'outline'} size="sm">
            {t.label}
          </Button>
        </Link>
      ))}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <ContentLayout title="My Availability">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Meetings', href: '/meetings/inbox' },
          { label: 'Availability' },
        ]}
      />
      <div className="space-y-4 mt-4">
        <PageHeader
          title="My Availability"
          description="Set the recurring weekly hours you're available for bookings. Changes save to jicate-booking when you click Save."
        />
        <MeetingsTabBar active="availability" />
        {children}
      </div>
    </ContentLayout>
  );
}

export default async function MeetingsAvailabilityPage() {
  // Explicit auth gate — render a clear message, never silently redirect.
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
            <p className="text-xs text-muted-foreground">
              Please sign in to MyJKKN to manage your availability.
            </p>
            <Link href="/auth/login" className="mt-2 inline-flex">
              <Button size="sm">Sign in</Button>
            </Link>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  // getMySchedule() runs ensureProvisioned() internally and creates a default
  // schedule for brand-new accounts, so a successful result always has data.
  const result = await getMySchedule();

  // `result.data` is optional on the flat ActionResult shape; treat a missing
  // payload the same as an explicit failure so we never render a blank editor.
  if (!result.success || !result.data) {
    return (
      <Shell>
        <Card className="border-destructive/30">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-destructive/60" aria-hidden />
            <h3 className="text-sm font-medium">Couldn&apos;t load your availability</h3>
            <p className="max-w-md text-xs text-muted-foreground">
              {result.error ?? 'Your availability could not be loaded.'}
            </p>
            <p className="text-[11px] text-muted-foreground">
              If this keeps happening, contact your MyJKKN administrator.
            </p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <AvailabilityEditor schedule={result.data} />
    </Shell>
  );
}
