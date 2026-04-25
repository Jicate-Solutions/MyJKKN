/**
 * LTI Tools Management Page
 * System admin page for managing LTI 1.3 tool registrations
 *
 * Created: 2026-01-12
 */

import { Suspense } from 'react';
import { Metadata } from 'next';
import { AlertCircle } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LtiToolsTable } from './_components/lti-tools-table';

export const metadata: Metadata = {
  title: 'LTI Tools Management',
  description: 'Manage LTI 1.3 tool registrations (MATLAB Grader, MATLAB Online, etc.)'
};

export default function LtiToolsPage() {
  return (
    <ContentLayout title="LTI Tools">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'System' },
          { label: 'LTI Tools' }
        ]}
      />
      <div className="space-y-6 mt-4">
        {/* Header — the "Register New Tool" button is rendered inside
            <LtiToolsTable /> so it shares fetchTools() and refreshes the
            table after creation. Previously the button lived here and
            created tools without refreshing (silent-failure pattern (e)). */}
        <div>
          <h1 className="text-2xl font-bold">LTI Tools Management</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage Learning Tools Interoperability (LTI) 1.3 integrations
          </p>
        </div>

      {/* Info Alert */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          LTI 1.3 tools allow external applications like MATLAB to integrate with MyJKKN.
          Students get single sign-on access and grades sync automatically.
        </AlertDescription>
      </Alert>

      {/* Tools Table */}
      <Suspense
        fallback={
          <div className="flex h-64 items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="text-sm text-gray-500">Loading LTI tools...</p>
            </div>
          </div>
        }
      >
        <LtiToolsTable />
      </Suspense>

      {/* Endpoints Reference */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-3">
          MyJKKN LTI Endpoints
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
              GET
            </span>
            <code className="text-primary">
              https://jkkn.ai/api/lti/jwks
            </code>
            <span className="text-gray-500">- Public key (JWKS)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
              POST
            </span>
            <code className="text-primary">
              https://jkkn.ai/api/lti/auth
            </code>
            <span className="text-gray-500">- OIDC login init</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
              POST
            </span>
            <code className="text-primary">
              https://jkkn.ai/api/lti/launch
            </code>
            <span className="text-gray-500">- Launch endpoint</span>
          </div>
        </div>
      </div>
      </div>
    </ContentLayout>
  );
}
