// app/(routes)/meetings/contacts/scan/page.tsx
//
// Business-card scanner — capture + review on ONE screen.
//
// Two surfaces, one lane (Director decisions 5, 6, 7, 13, 20–25):
//   · Capture — phone camera, rapid-fire. Snap and immediately snap again; the
//     reader never blocks the shutter.
//   · Review  — the extracted form beside the card photo, doubtful cards FIRST,
//     duplicate warnings against the shared contact book AND MyJKKN's own
//     people, then a human presses Save.
//
// SECURITY: wrapped in <PermissionGuard module="meetings" action="contacts.scan">
// with an explicit no-access card rather than a silent redirect (rule #27). The
// API routes re-check on the server — the guard is UX, not enforcement.

import { AlertCircle } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { createClient } from '@/lib/supabase/server';
import { CardScanClient } from './_components/card-scan-client';

export const dynamic = 'force-dynamic';

export default async function ScanCardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <ContentLayout title="Scan a Card">
        <Card className="mt-6">
          <CardContent className="flex items-start gap-3 py-6">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">You are not signed in</p>
              <p className="text-sm text-muted-foreground">
                Sign in to scan business cards into the contact book.
              </p>
            </div>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Scan a Card">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Meetings', href: '/meetings/inbox' },
          { label: 'Contacts', href: '/meetings/contacts' },
          { label: 'Scan a Card' },
        ]}
      />
      <div className="mt-4">
        <PageHeader
          title="Scan a Card"
          description="Photograph a visiting card, check what was read, then save it to the contact book."
        />
      </div>

      <PermissionGuard
        module="meetings"
        action="contacts.scan"
        fallback={
          <Card className="mt-6">
            <CardContent className="flex items-start gap-3 py-6">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">You don&rsquo;t have access to card scanning</p>
                <p className="text-sm text-muted-foreground">
                  Ask an administrator to grant your role the &ldquo;Scan Business
                  Cards&rdquo; permission.
                </p>
              </div>
            </CardContent>
          </Card>
        }
      >
        <CardScanClient userEmail={user.email ?? null} />
      </PermissionGuard>
    </ContentLayout>
  );
}
