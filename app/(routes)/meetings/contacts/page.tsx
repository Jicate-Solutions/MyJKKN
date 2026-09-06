// app/(routes)/meetings/contacts/page.tsx
//
// Universal Booking M6 — "Contacts" (Calendly parity).
//
// The people who have booked the signed-in host: name / email / # bookings /
// last booked, with a drawer per contact showing their scheduling-activity
// timeline + editable private notes + a "Share availability" action that copies
// the host's public /meet/<handle> link.
//
// SECURITY: the roster comes from MeetingContactsService against the RLS client,
// whose RPC self-scopes to auth.uid(); the page also wraps the content in
// <PermissionGuard module="meetings" action="contacts.view"> with an explicit
// no-access fallback (rule #27 — never a silent redirect). The auth gate
// renders a clear "not signed in" card rather than bouncing.

import Link from 'next/link';
import { AlertCircle, Users } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { createClient } from '@/lib/supabase/server';
import { MeetingContactsService } from '@/lib/services/meetings/meeting-contacts-service';
import { ContactsTable } from './_components/contacts-table';

export const dynamic = 'force-dynamic';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <ContentLayout title="Contacts">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Meetings', href: '/meetings/inbox' },
          { label: 'Contacts' },
        ]}
      />
      <div className="space-y-4 mt-4">
        <PageHeader
          title="Contacts"
          description="People who have booked time with you — their scheduling activity and your private notes."
        />
        {children}
      </div>
    </ContentLayout>
  );
}

function NoAccess() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
        <AlertCircle className="h-8 w-8 text-muted-foreground/50" aria-hidden />
        <h3 className="text-sm font-medium">You don&apos;t have access to Contacts</h3>
        <p className="text-xs text-muted-foreground">
          Ask an administrator to grant you the{' '}
          <code className="rounded bg-muted px-1">meetings.contacts.view</code> permission.
        </p>
      </CardContent>
    </Card>
  );
}

export default async function MeetingsContactsPage() {
  // Explicit auth gate — clear message, never a silent redirect (rule #27).
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
              Please sign in to MyJKKN to view your contacts.
            </p>
            <Link href="/auth/login" className="mt-2 inline-flex">
              <Button size="sm">Sign in</Button>
            </Link>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  // meeting_* tables aren't in generated types (TS2589 class) — untyped client.
  const untyped = supabase as unknown as SupabaseClient;
  const [contacts, handle] = await Promise.all([
    MeetingContactsService.listContacts(untyped),
    MeetingContactsService.getHostHandle(untyped, user.id),
  ]);

  // Absolute base for the share link — falls back to a relative path the
  // browser resolves against the current origin.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const shareBase = appUrl ? `${appUrl.replace(/\/$/, '')}/meet` : '/meet';
  const shareUrl = handle ? `${shareBase}/${handle}` : null;

  return (
    <Shell>
      {/* contacts.view is the dedicated key; meetings.view is accepted too so
          any host who can reach the Meetings module sees their own contacts
          (RLS is the real boundary — the roster RPC self-scopes to auth.uid()). */}
      <PermissionGuard
        module="meetings"
        action={['contacts.view', 'view']}
        anyAction
        fallback={<NoAccess />}
      >
        {contacts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Users className="mx-auto h-10 w-10 text-muted-foreground/40" aria-hidden />
              <h3 className="mt-3 text-sm font-medium">No contacts yet</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Once people book time with you, they&apos;ll show up here with their
                scheduling history.
              </p>
            </CardContent>
          </Card>
        ) : (
          <ContactsTable contacts={contacts} shareUrl={shareUrl} />
        )}
      </PermissionGuard>
    </Shell>
  );
}
