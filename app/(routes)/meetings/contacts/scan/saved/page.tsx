// app/(routes)/meetings/contacts/scan/saved/page.tsx
//
// "Scanned Contacts" — where every card you saved actually went.
//
// Five of the nine destinations a card can be routed to have NO screen of their
// own (sh_prospects, industry_partners, ss_mentors, ims_suppliers,
// internship_site_contacts). Measured on production 2026-08-06:
// `industry_partners` held exactly one row — written from a phone by the card
// scanner — and there was nowhere in the product to see it.
//
// Director decision 2026-08-06: ONE screen showing everything, grouped by
// destination, rather than five separate module pages. Cards that could not be
// filed appear FIRST as "Needs attention", because a skipped card that nobody
// can see is a card nobody will ever finish.

import { AlertCircle } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { createClient } from '@/lib/supabase/server';
import { SavedScansClient } from './_components/saved-scans-client';

export const dynamic = 'force-dynamic';

export default async function SavedScansPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <ContentLayout title="Scanned Contacts">
        <Card className="mt-6">
          <CardContent className="flex items-start gap-3 py-6">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">You are not signed in</p>
              <p className="text-sm text-muted-foreground">
                Sign in to see the cards you have scanned.
              </p>
            </div>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Scanned Contacts">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Meetings', href: '/meetings/inbox' },
          { label: 'Contacts', href: '/meetings/contacts' },
          { label: 'Scanned Contacts' },
        ]}
      />
      <div className="mt-4">
        <PageHeader
          title="Scanned Contacts"
          description="Every card you saved, and which list it went into."
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
        <SavedScansClient />
      </PermissionGuard>
    </ContentLayout>
  );
}
