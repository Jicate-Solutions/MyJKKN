// app/(routes)/meetings/webhooks/page.tsx
//
// MODULE 9 — "Custom Webhooks" admin surface (Universal Booking, Calendly
// parity). A host registers webhook URLs + the booking lifecycle events they
// want, and reviews the delivery log. Booking events (created / cancelled /
// rescheduled) are POSTed in near-real-time by /api/cron/meeting-webhooks.
//
// Server component:
//   1. Resolve the signed-in user. If signed out, render an explicit notice —
//      never silently redirect (rule #27).
//   2. Load the host's webhooks + recent deliveries (RLS-scoped to them).
//   3. Hand them to the client manager, wrapped in <PermissionGuard> for the
//      meetings.webhooks.view key. Super admins always pass; the fallback
//      explains the missing grant rather than blanking the page.

import Link from 'next/link';
import { Calendar, Clock, Inbox, Webhook as WebhookIcon } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { cn } from '@/lib/utils';

import { listMyWebhooks, listMyDeliveries } from './actions';
import { WebhooksManager } from './_components/webhooks-manager';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'availability', label: 'Availability', href: '/meetings/availability', icon: Clock },
  { key: 'inbox', label: 'Inbox', href: '/meetings/inbox', icon: Inbox },
  { key: 'manage', label: 'Manage', href: '/meetings/manage', icon: Calendar },
  { key: 'webhooks', label: 'Webhooks', href: '/meetings/webhooks', icon: WebhookIcon },
] as const;

export default async function MeetingsWebhooksPage() {
  const [hooks, deliveries] = await Promise.all([listMyWebhooks(), listMyDeliveries()]);

  return (
    <ContentLayout title="Webhooks">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Meetings', href: '/meetings/inbox' },
          { label: 'Webhooks' },
        ]}
      />

      <div className="space-y-4 mt-4">
        <PageHeader
          title="Custom Webhooks"
          description="Get booking information in real time. Register an endpoint and MyJKKN will POST a signed payload whenever a meeting is booked, cancelled, or rescheduled."
        />

        {/* Section tab bar — Availability / Inbox / Manage / Webhooks */}
        <nav
          aria-label="Meetings sections"
          className="flex flex-wrap gap-1 border-b border-border"
        >
          {TABS.map((tab) => {
            const active = tab.key === 'webhooks';
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

        <PermissionGuard
          module="meetings"
          action="webhooks.view"
          loading={
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Checking your access…
              </CardContent>
            </Card>
          }
          fallback={
            <Card className="border-amber-300/50">
              <CardContent className="space-y-3 py-10 text-center">
                <WebhookIcon
                  className="mx-auto h-10 w-10 text-muted-foreground/40"
                  aria-hidden
                />
                <div>
                  <h3 className="text-sm font-medium">Webhooks access not enabled</h3>
                  <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                    You don&apos;t have the <code>meetings.webhooks.view</code> permission
                    yet. Ask an administrator to grant it in Role Management.
                  </p>
                </div>
                <div className="flex justify-center pt-1">
                  <Link href="/meetings/inbox" className="inline-flex">
                    <Button variant="ghost" size="sm">
                      Back to inbox
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          }
        >
          <WebhooksManager
            initialWebhooks={hooks.success ? hooks.data : []}
            initialDeliveries={deliveries.success ? deliveries.data : []}
            loadError={hooks.success ? null : hooks.error}
          />
        </PermissionGuard>
      </div>
    </ContentLayout>
  );
}
