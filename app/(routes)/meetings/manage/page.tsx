// app/(routes)/meetings/manage/page.tsx
//
// NATIVE "Manage Meeting Types" page (Path W) — replaces the broken cross-origin
// Cal.com iframe editor (the old JicateBookingEmbed mode="event-types").
//
// The user manages their bookable event types INSIDE MyJKKN, with their MyJKKN
// identity, via the Cal.com v2 REST API called server-side with their per-user
// vaulted API key. No separate Cal.com login.
//
// Server-side here:
//   1. Resolve the current user. If signed out, render an explicit notice
//      (never silently redirect — rule #27).
//   2. ensureProvisioned(...) — idempotent; guarantees a Cal.com identity + key.
//   3. Fetch the user's event types via the listMyEventTypes() server action and
//      hand them to the client manager as the initial list.
//
// Companion:
//   actions.ts                          — 'use server' CRUD actions
//   _components/event-types-manager.tsx  — 'use client' interactive manager

import Link from 'next/link';
import { Calendar, Clock, Inbox } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import { listMyEventTypes } from './actions';
import { EventTypesManager } from './_components/event-types-manager';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'availability', label: 'Availability', href: '/meetings/availability', icon: Clock },
  { key: 'inbox', label: 'Inbox', href: '/meetings/inbox', icon: Inbox },
  { key: 'manage', label: 'Manage', href: '/meetings/manage', icon: Calendar },
] as const;

export default async function MeetingsManagePage() {
  const initial = await listMyEventTypes();

  return (
    <ContentLayout title="Manage Meeting Types">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Meetings', href: '/meetings/inbox' },
          { label: 'Manage' },
        ]}
      />

      <div className="space-y-4 mt-4">
        <PageHeader
          title="Manage Meeting Types"
          description="Create and edit the meeting types people can book with you. Managed entirely inside MyJKKN — no separate sign-in."
        />

        {/* Section tab bar — Availability / Inbox / Manage */}
        <nav
          aria-label="Meetings sections"
          className="flex flex-wrap gap-1 border-b border-border"
        >
          {TABS.map((tab) => {
            const active = tab.key === 'manage';
            const Icon = tab.icon;
            return (
              <Link
                key={tab.key}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {tab.label}
              </Link>
            );
          })}
        </nav>

        {initial.success ? (
          <EventTypesManager initialEventTypes={initial.data} />
        ) : (
          <Card className="border-destructive/40">
            <CardContent className="space-y-3 py-10 text-center">
              <Calendar
                className="mx-auto h-10 w-10 text-muted-foreground/40"
                aria-hidden
              />
              <div>
                <h3 className="text-sm font-medium">Could not load your meeting types</h3>
                <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                  {initial.error}
                </p>
              </div>
              <div className="flex justify-center gap-2 pt-1">
                <Link href="/meetings/manage" className="inline-flex">
                  <Button variant="outline" size="sm">
                    Retry
                  </Button>
                </Link>
                <Link href="/meetings/inbox" className="inline-flex">
                  <Button variant="ghost" size="sm">
                    Back to inbox
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
