// app/(routes)/meetings/routing-forms/[id]/page.tsx
//
// Routing Forms admin — BUILDER page (Universal Booking M1).
// Three tabs: Fields (questions), Rules (ordered IF/THEN routing + default),
// Responses (submissions). Loads the form + rules server-side via the
// getRoutingForm action and hands them to the client builder.
//
// Gated with <PermissionGuard module="meetings" action="routing.view">. Explicit
// not-found state when the id is unknown (rule #27 — never silent-redirect).

import { Suspense } from 'react';

import { PermissionGuard } from '@/components/auth/permission-guard';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';

import { getRoutingForm } from '../actions';
import { RoutingFormBuilder } from '../_components/routing-form-builder';

export const dynamic = 'force-dynamic';

interface BuilderPageProps {
  params: Promise<{ id: string }>;
}

export default async function RoutingFormBuilderPage({ params }: BuilderPageProps) {
  const { id } = await params;
  const result = await getRoutingForm(id);

  return (
    <PermissionGuard
      module="meetings"
      action="routing.view"
      fallback={
        <ContentLayout title="Routing Form">
          <Card className="border-amber-300/50">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              You don&apos;t have access to Routing Forms. Contact your administrator.
            </CardContent>
          </Card>
        </ContentLayout>
      }
    >
      <ContentLayout title={result.success && result.data ? result.data.title : 'Routing Form'}>
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Meetings', href: '/meetings/inbox' },
            { label: 'Routing Forms', href: '/meetings/routing-forms' },
            { label: result.success && result.data ? result.data.title : 'Form' },
          ]}
        />

        <div className="mt-4">
          {result.success && result.data ? (
            // Suspense boundary required: the builder's useTabParam() reads useSearchParams().
            <Suspense fallback={null}>
              <RoutingFormBuilder form={result.data} />
            </Suspense>
          ) : (
            <Card className="border-destructive/40">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {result.error ?? 'This routing form could not be found.'}
              </CardContent>
            </Card>
          )}
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
