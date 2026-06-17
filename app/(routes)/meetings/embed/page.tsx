'use client';

// app/(routes)/meetings/embed/page.tsx
//
// Universal Booking M7 — admin "Embed & Theming" page.
//
// Lets a host (1) pick a brand color for their public booking widget, and
// (2) copy a ready-made <iframe> / popup-button snippet to paste on their own
// website (Calendly's "embed Calendly on a website" + "custom colors").
//
// Client page (the codebase idiom — every PermissionGuard'd page is a client
// component; the guard's children must be client JSX, not an async server
// component). Data is loaded inside EmbedManager via the getMyEmbedState
// server action, which itself enforces auth (explicit signed-out error —
// rule #27). The page is gated by PermissionGuard module="meetings"
// action="embed.manage".
//
// Design system mirrors the sibling /meetings/availability page:
// ContentLayout + PageBreadcrumb + PageHeader + a Meetings tab bar.

import Link from 'next/link';
import { AlertCircle } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { EmbedManager } from './_components/embed-manager';

const MEETINGS_TABS = [
  { key: 'inbox', label: 'Inbox', href: '/meetings/inbox' },
  { key: 'availability', label: 'My Availability', href: '/meetings/availability' },
  { key: 'manage', label: 'Manage Event Types', href: '/meetings/manage' },
  { key: 'embed', label: 'Embed & Theming', href: '/meetings/embed' },
] as const;

function MeetingsTabBar({ active }: { active: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {MEETINGS_TABS.map((t) => (
        <Link key={t.key} href={t.href} className="inline-flex">
          <button
            type="button"
            className={
              active === t.key
                ? 'inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground'
                : 'inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent'
            }
          >
            {t.label}
          </button>
        </Link>
      ))}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <ContentLayout title="Embed & Theming">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Meetings', href: '/meetings/inbox' },
          { label: 'Embed & Theming' },
        ]}
      />
      <div className="space-y-4 mt-4">
        <PageHeader
          title="Embed & Theming"
          description="Add your booking widget to any website and match it to your brand color."
        />
        <MeetingsTabBar active="embed" />
        {children}
      </div>
    </ContentLayout>
  );
}

export default function MeetingsEmbedPage() {
  return (
    <PermissionGuard
      module="meetings"
      action="embed.manage"
      loading={
        <Shell>
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Loading…
            </CardContent>
          </Card>
        </Shell>
      }
      fallback={
        <Shell>
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <AlertCircle className="h-8 w-8 text-muted-foreground/50" aria-hidden />
              <h3 className="text-sm font-medium">You don&apos;t have access to this page</h3>
              <p className="max-w-md text-xs text-muted-foreground">
                Managing the booking embed requires the{' '}
                <code className="rounded bg-muted px-1 py-0.5">meetings.embed.manage</code>{' '}
                permission. Contact your MyJKKN administrator if you need it.
              </p>
            </CardContent>
          </Card>
        </Shell>
      }
    >
      <Shell>
        <EmbedManager />
      </Shell>
    </PermissionGuard>
  );
}
