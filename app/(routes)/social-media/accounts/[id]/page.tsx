/**
 * Social Media Account Detail Page
 * Shows deep metrics for a single account
 */

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { AccountDetail } from '../../_components/account-detail';

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile } = await getEnhancedUserProfile();
  const institutionId = profile?.institution_id;

  if (!institutionId) {
    return (
      <ContentLayout title="Account Detail">
        <Card className="max-w-md mx-auto mt-20">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">
              You need to be assigned to an institution to view account details.
            </p>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Account Detail">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Social Media', href: '/social-media' },
          { label: 'Accounts', href: '/social-media/accounts' },
          { label: 'Account Detail', href: `/social-media/accounts/${id}` },
        ]}
      />

      <AccountDetail accountId={id} institutionId={institutionId} />
    </ContentLayout>
  );
}
