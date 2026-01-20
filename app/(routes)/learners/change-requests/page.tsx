// ============================================
// CHANGE REQUESTS MANAGEMENT PAGE (SERVER COMPONENT)
// ============================================
// Created: 2025-01-20
// Purpose: HOD/Staff page to view and manage pending student profile change requests
// ============================================

import { redirect } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { ChangeRequestsClient } from './_components/change-requests-client';
import { LearnerProfileChangeService } from '@/lib/services/learner-profile-change-service';
import { createClient } from '@/lib/supabase/server';
import type { ChangeRequestStatus } from '@/types/learner-profile-change';

/**
 * Change Requests Management Page - Server Component
 *
 * Features:
 * - Role-based access (HOD/Staff/Super Admin only)
 * - Role-based data filtering
 *   - Super Admin: all requests
 *   - HOD: institution-wide requests
 *   - Staff: department-only requests
 * - Status tabs (Pending, Approved, Rejected)
 * - Search and filter functionality
 */
export default async function ChangeRequestsPage() {
  const supabase = await createClient();

  // 1. Check authentication
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  // 2. Get user profile and check role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, institution_id, department_id')
    .eq('id', user.id)
    .single();

  if (!profile) {
    redirect('/unauthorized');
  }

  // 3. Verify role is HOD, Staff, or Super Admin
  const allowedRoles = ['super_admin', 'hod', 'staff'];
  if (!allowedRoles.includes(profile.role)) {
    redirect('/unauthorized');
  }

  // 4. Fetch pending requests with role-based filtering
  let filters: {
    status?: ChangeRequestStatus;
    institution_id?: string;
    department_id?: string;
  } = {};

  // Apply role-based filters
  if (profile.role === 'super_admin') {
    // Super Admin sees all requests (no filters)
    filters = {};
  } else if (profile.role === 'hod') {
    // HOD sees institution-wide requests
    filters = {
      institution_id: profile.institution_id || undefined,
    };
  } else if (profile.role === 'staff') {
    // Staff sees department-only requests
    filters = {
      department_id: profile.department_id || undefined,
    };
  }

  // Fetch all statuses (client component will handle filtering by tabs)
  const [pendingRequests, approvedRequests, rejectedRequests] = await Promise.all([
    LearnerProfileChangeService.getPendingRequests({
      ...filters,
      status: 'pending',
      limit: 1000, // Fetch all
    }),
    LearnerProfileChangeService.getPendingRequests({
      ...filters,
      status: 'approved',
      limit: 1000,
    }),
    LearnerProfileChangeService.getPendingRequests({
      ...filters,
      status: 'rejected',
      limit: 1000,
    }),
  ]);

  // Combine all requests for client component
  const allRequests = [
    ...pendingRequests.data,
    ...approvedRequests.data,
    ...rejectedRequests.data,
  ];

  return (
    <ContentLayout title="Change Requests Management">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learners' },
          { label: 'Change Requests' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <h1 className="text-2xl font-bold py-1">Change Requests Management</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Review and approve student profile change requests
            </p>
          </div>
        </div>

        {/* Client Component with Tabs and Table */}
        <ChangeRequestsClient initialData={allRequests} />
      </div>
    </ContentLayout>
  );
}
