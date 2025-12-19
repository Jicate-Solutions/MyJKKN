// ============================================
// NEW ENQUIRY PAGE
// ============================================
// Created: 2025-01-18
// Purpose: Create new learner enquiry
// ============================================

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EnquiryForm } from '../_components/enquiry-form';
import { usePermissions } from '@/hooks/use-permissions';
import { Loader2 } from 'lucide-react';

/**
 * NewEnquiryPage Component
 *
 * Page for creating new learner enquiries
 *
 * Features:
 * - Permission-based access control
 * - Breadcrumb navigation
 * - Form for capturing enquiry details
 * - Auto-redirect to enquiry detail page on success
 */
export default function NewEnquiryPage() {
  const router = useRouter();
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);

  // Get permissions
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading,
  } = usePermissions([], { waitForLoad: true });

  // Define access permissions
  const canCreateEnquiries = isSuperAdmin || canAccess('learners', 'create');

  // Track when permissions are loaded
  useEffect(() => {
    if (!permissionsLoading) {
      setPermissionsLoaded(true);
    }
  }, [permissionsLoading]);

  // Redirect if user doesn't have permission
  useEffect(() => {
    if (permissionsLoaded && !canCreateEnquiries) {
      router.push('/unauthorized');
    }
  }, [permissionsLoaded, canCreateEnquiries, router]);

  // Show loading state while permissions are loading
  if (permissionsLoading || !permissionsLoaded) {
    return (
      <ContentLayout title="Add New Enquiry">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </ContentLayout>
    );
  }

  // Permission check (redundant but added for safety)
  if (!canCreateEnquiries) {
    return (
      <ContentLayout title="Add New Enquiry">
        <div className="text-center py-8">
          <p className="text-destructive">
            You don&apos;t have permission to create enquiries
          </p>
          <Button variant="outline" asChild className="mt-4">
            <Link href="/learners/enquiries">Back to Enquiries</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Add New Enquiry">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learners', href: '/learners' },
          { label: 'Enquiries', href: '/learners/enquiries' },
          { label: 'New Enquiry' }
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold py-1">New Enquiry</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Create a new admission enquiry to track prospective students
          </p>
        </div>

        {/* Enquiry Form */}
        <Card className="p-6">
          <EnquiryForm />
        </Card>
      </div>
    </ContentLayout>
  );
}
