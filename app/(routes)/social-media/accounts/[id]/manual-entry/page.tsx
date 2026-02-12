/**
 * Social Media Manual Entry Page
 * Form for manually entering account metrics (followers, likes, posts)
 */

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { ManualEntryForm } from '../../../_components/manual-entry-form';

export default async function ManualEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile } = await getEnhancedUserProfile();
  const institutionId = profile?.institution_id;

  if (!institutionId) {
    return (
      <ContentLayout title="Manual Entry">
        <Card className="max-w-md mx-auto mt-20">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">
              You need to be assigned to an institution to add manual entries.
            </p>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Manual Entry">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Social Media', href: '/social-media' },
          { label: 'Accounts', href: '/social-media/accounts' },
          { label: 'Account Detail', href: `/social-media/accounts/${id}` },
          { label: 'Manual Entry', href: `/social-media/accounts/${id}/manual-entry` },
        ]}
      />

      <ManualEntryForm accountId={id} institutionId={institutionId} />
    </ContentLayout>
  );
}
