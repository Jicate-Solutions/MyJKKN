/**
 * Social Media Accounts — List Page
 * Shows all registered social media accounts with health indicators
 */

import { Suspense } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { AccountsList } from '../_components/accounts-list';

export default async function SocialMediaAccountsPage() {
  const { profile } = await getEnhancedUserProfile();
  const institutionId = profile?.institution_id;

  if (!institutionId) {
    return (
      <ContentLayout title="Social Media Accounts">
        <div className="flex items-center justify-center min-h-[400px]">
          <Card className="max-w-md">
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground">
                You need to be assigned to an institution to view accounts.
              </p>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Social Media Accounts">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Social Media', href: '/social-media' },
          { label: 'Accounts', href: '/social-media/accounts' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Social Media Accounts</h1>
          <p className="text-sm text-muted-foreground">
            All registered accounts across platforms with health indicators
          </p>
        </div>

        <Suspense fallback={<AccountsSkeleton />}>
          <AccountsList institutionId={institutionId} />
        </Suspense>
      </div>
    </ContentLayout>
  );
}

function AccountsSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(8)].map((_, i) => (
        <Card key={i}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-6 w-16" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
