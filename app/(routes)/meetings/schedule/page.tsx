// app/(routes)/meetings/schedule/page.tsx
//
// "Schedule a meeting" — the host-initiated half of the meetings module.
//
// Until now the module was publish-and-wait: you created meeting types and
// people booked them. There was no way to simply put a meeting in front of
// three named people, which is what a Director does most days. This page is
// that missing direction.
//
// Gated on the existing `meetings.view` (via lib/sidebarMenuLink.ts) rather
// than a new permission key: the page can only ever schedule as the SIGNED-IN
// user's own calendar, so anyone allowed into the module is allowed to use it.
// A fresh key would land false on nearly every role and read as broken.
//
// Companion:
//   actions.ts                     — 'use server' actions (identity from session)
//   _components/schedule-form.tsx  — 'use client' form
//   lib/services/meetings/host-scheduling-service.ts — booking + Meet + email

import Link from 'next/link';
import { Calendar, CalendarPlus, Clock, Inbox } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';

import { ScheduleForm } from './_components/schedule-form';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'availability', label: 'Availability', href: '/meetings/availability', icon: Clock },
  { key: 'inbox', label: 'Inbox', href: '/meetings/inbox', icon: Inbox },
  { key: 'manage', label: 'Manage', href: '/meetings/manage', icon: Calendar },
  { key: 'schedule', label: 'Schedule', href: '/meetings/schedule', icon: CalendarPlus },
] as const;

export default async function ScheduleMeetingPage() {
  // Rule #27: a signed-out visitor gets an explicit notice, never a silent
  // redirect that leaves them clicking the same link forever.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <ContentLayout title="Schedule a Meeting">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Meetings', href: '/meetings/inbox' },
          { label: 'Schedule' },
        ]}
      />

      <div className="space-y-4 mt-4">
        <PageHeader
          title="Schedule a Meeting"
          description="Pick a time and the people, and MyJKKN books it, creates the Google Meet link and sends everyone the invitation."
        />

        <nav aria-label="Meetings sections" className="flex flex-wrap gap-1 border-b border-border">
          {TABS.map((tab) => {
            const active = tab.key === 'schedule';
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

        {user ? (
          <ScheduleForm />
        ) : (
          <Card className="border-destructive/40">
            <CardContent className="space-y-2 py-10 text-center">
              <h3 className="text-sm font-medium">You are signed out</h3>
              <p className="mx-auto max-w-md text-xs text-muted-foreground">
                A meeting is scheduled on your own calendar, so MyJKKN needs to know who
                you are. Sign in and open this page again.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
