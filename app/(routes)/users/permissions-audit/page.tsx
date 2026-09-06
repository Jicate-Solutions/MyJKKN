import { Suspense } from 'react';
import { PermissionsAuditClient } from './_components/permissions-audit-client';

export default function PermissionsAuditPage() {
  // Suspense boundary required: the client reads ?tab= via useSearchParams()
  // (deep-linkable / favoritable tabs). Without it the build fails at
  // prerender with "useSearchParams() should be wrapped in a suspense
  // boundary".
  return (
    <Suspense fallback={null}>
      <PermissionsAuditClient />
    </Suspense>
  );
}
