/**
 * LTI Tools Management Page
 * System admin page for managing LTI 1.3 tool registrations
 *
 * Created: 2026-01-12
 */

import { Suspense } from 'react';
import { Metadata } from 'next';
import { Plus, AlertCircle } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LtiToolsTable } from './_components/lti-tools-table';
import { LtiToolDialog } from './_components/lti-tool-dialog';

export const metadata: Metadata = {
  title: 'LTI Tools Management | MyJKKN',
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
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">LTI Tools Management</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Manage Learning Tools Interoperability (LTI) 1.3 integrations
            </p>
          </div>

          <LtiToolDialog mode="create">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Register New Tool
            </Button>
          </LtiToolDialog>
        </div>

      {/* Info Alert */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          LTI 1.3 tools allow external applications like MATLAB to integrate with MyJKKN.
          Students get single sign-on access and grades sync automatically.
          <a
            href="/docs/admin/lti-tools-admin-guide.md"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 font-medium text-primary hover:underline"
          >
            Learn more →
          </a>
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

      {/* Documentation Links */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-3">
          Documentation & Guides
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <a
            href="/docs/features/mathswork/RSA-Key-Generation-Guide.md"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <span>📝</span>
            RSA Key Generation Guide
          </a>
          <a
            href="/docs/admin/lti-tools-admin-guide.md"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <span>📘</span>
            Admin Guide
          </a>
          <a
            href="/docs/developers/lti-integration-architecture.md"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <span>🏗️</span>
            Architecture Documentation
          </a>
        </div>
      </div>

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
              https://myjkkn.jkkn.ac.in/api/lti/jwks
            </code>
            <span className="text-gray-500">- Public key (JWKS)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
              POST
            </span>
            <code className="text-primary">
              https://myjkkn.jkkn.ac.in/api/lti/auth
            </code>
            <span className="text-gray-500">- OIDC login init</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
              POST
            </span>
            <code className="text-primary">
              https://myjkkn.jkkn.ac.in/api/lti/launch
            </code>
            <span className="text-gray-500">- Launch endpoint</span>
          </div>
        </div>
      </div>
      </div>
    </ContentLayout>
  );
}
