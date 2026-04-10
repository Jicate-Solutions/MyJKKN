'use client';

// Shared access-denied UI for marathon admin-only pages.
// Shown when a non-admin user navigates to a restricted page.

import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { ShieldAlert } from 'lucide-react';

interface MarathonAccessDeniedProps {
  /** Page title shown in ContentLayout */
  title?: string;
  /** Event ID — used to redirect to registrations page */
  eventId?: string;
}

export function MarathonAccessDenied({
  title = 'Access Denied',
  eventId,
}: MarathonAccessDeniedProps) {
  const router = useRouter();

  return (
    <ContentLayout title={title}>
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <ShieldAlert className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Access Denied</h2>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          You don&apos;t have permission to access this page.
          Only event administrators and coordinators can manage this section.
        </p>
        <div className="flex gap-2">
          {eventId && (
            <Button
              variant="default"
              onClick={() => router.push(`/events/marathon/${eventId}/registrations`)}
            >
              View Registrations
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => router.push('/events/marathon')}
          >
            Back to Events
          </Button>
        </div>
      </div>
    </ContentLayout>
  );
}
