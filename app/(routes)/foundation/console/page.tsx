'use client';

// Foundation — Faculty console.
// Permission-guarded (foundation.cohorts.view). Lists the resource person's
// cohorts, opens each cohort's roster, and hosts the item-authoring and
// assessment-building entry points. Denials render an explicit 403.

import { usePermissions } from '@/hooks/use-permissions';
import { PermissionError } from '@/components/errors/permission-error';
import { Skeleton } from '@/components/ui/skeleton';
import { FoundationHeader } from '../_components/foundation-header';
import { CohortConsole } from '../_components/cohort-console';

export default function FoundationConsolePage() {
  const { isLoading, canAccess } = usePermissions();

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-8">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (!canAccess('foundation', 'cohorts.view')) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 md:px-8">
        <PermissionError
          message="You do not have access to the Foundation faculty console."
          requiredPermission="foundation.cohorts.view"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 md:px-8">
      <FoundationHeader
        title="Faculty console"
        subtitle="Your active cohorts, rosters, question bank and assessments."
        crumbs={[
          { label: 'Foundation', href: '/foundation' },
          { label: 'Console' },
        ]}
      />
      <CohortConsole />
    </div>
  );
}
