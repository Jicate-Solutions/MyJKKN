// app/(routes)/meetings/polls/page.tsx
//
// Meeting Polls — admin list (Universal Booking M5). Lists the signed-in
// host's polls (open + closed) with vote tallies, and links into the create
// flow and per-poll results. Gated by the meetings.polls.view permission.
//
// Server component loads the initial list via the server action (RLS scopes
// it to the host); the client manager handles create + delete interactivity.
//
// Pattern: app/(routes)/meetings/manage/page.tsx (server load → client list).

import Link from 'next/link';
import { Calendar, Clock, Inbox, Vote } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { cn } from '@/lib/utils';

import { listMyPollsAction } from './actions';
import { PollsManager } from './_components/polls-manager';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'inbox', label: 'Inbox', href: '/meetings/inbox', icon: Inbox },
  { key: 'availability', label: 'Availability', href: '/meetings/availability', icon: Clock },
  { key: 'manage', label: 'Manage', href: '/meetings/manage', icon: Calendar },
  { key: 'polls', label: 'Polls', href: '/meetings/polls', icon: Vote },
] as const;

export default async function MeetingPollsPage() {
  const result = await listMyPollsAction();
  const polls = result.success ? result.data ?? [] : [];

  return (
    <PermissionGuard
      module="meetings"
      action="polls.view"
      fallback={
        <ContentLayout title="Meeting Polls">
          <div className="mx-auto max-w-md rounded-md border bg-muted/30 px-6 py-10 text-center">
            <p className="text-sm font-medium">You don&apos;t have access to Meeting Polls</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask an administrator to grant you the{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">meetings.polls.view</code>{' '}
              permission in Role Management.
            </p>
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="Meeting Polls">
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Meetings', href: '/meetings/inbox' },
            { label: 'Polls', href: '/meetings/polls' },
          ]}
        />

        {/* Tab strip (mirrors the other meetings surfaces). */}
        <div className="mb-6 flex flex-wrap gap-1 border-b">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = t.key === 'polls';
            return (
              <Link
                key={t.key}
                href={t.href}
                className={cn(
                  'inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" /> {t.label}
              </Link>
            );
          })}
        </div>

        {!result.success && (
          <div
            className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            {result.error ?? 'Could not load your polls.'}
          </div>
        )}

        <PollsManager initialPolls={polls} />
      </ContentLayout>
    </PermissionGuard>
  );
}
