// app/(routes)/meetings/routing-forms/page.tsx
//
// Routing Forms admin — LIST page (Universal Booking M1, Calendly parity).
// Lists the routing forms the signed-in user can see (RLS-scoped) and lets them
// create a new one. The builder lives at /meetings/routing-forms/[id].
//
// Gated with <PermissionGuard module="meetings" action="routing.view">. The
// permission key may not be registered yet — see NAV-WIRING-routing-forms.md.
// Until it is granted, super admins still pass (PermissionGuard super-admin
// bypass) so the page is verifiable.

import { PermissionGuard } from '@/components/auth/permission-guard';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';

import { listRoutingForms } from './actions';
import { RoutingFormsList } from './_components/routing-forms-list';

export const dynamic = 'force-dynamic';

export default async function RoutingFormsPage() {
  const initial = await listRoutingForms();

  return (
    <PermissionGuard
      module="meetings"
      action="routing.view"
      fallback={
        <ContentLayout title="Routing Forms">
          <Card className="border-amber-300/50">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              You don&apos;t have access to Routing Forms. Contact your administrator
              if you believe this is a mistake.
            </CardContent>
          </Card>
        </ContentLayout>
      }
    >
      <ContentLayout title="Routing Forms">
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Meetings', href: '/meetings/inbox' },
            { label: 'Routing Forms' },
          ]}
        />

        <div className="mt-4 space-y-4">
          <PageHeader
            title="Routing Forms"
            description="Public forms that send each visitor to the right place based on their answers — a scheduling link, a website, or a message."
          />

          {initial.success ? (
            <RoutingFormsList initialForms={initial.data ?? []} />
          ) : (
            <Card className="border-destructive/40">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {initial.error ?? 'Could not load routing forms.'}
              </CardContent>
            </Card>
          )}
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
