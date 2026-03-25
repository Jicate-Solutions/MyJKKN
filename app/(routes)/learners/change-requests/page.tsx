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

  // 3. Get effective roles (profiles.role + user_roles for multi-role support)
  const effectiveRoles = new Set<string>();
  if (profile.role) effectiveRoles.add(profile.role);

  const { data: userRoles } = await supabase
    .from('user_roles')
    .select('custom_roles!inner(role_key)')
    .eq('user_id', user.id);

  if (userRoles) {
    userRoles.forEach((ur: any) => {
      if (ur.custom_roles?.role_key) effectiveRoles.add(ur.custom_roles.role_key);
    });
  }

  // Verify user has an allowed role (legacy or multi-role)
  const allowedRoles = ['super_admin', 'hod', 'staff'];
  const hasAllowedRole = allowedRoles.some((r) => effectiveRoles.has(r));
  if (!hasAllowedRole) {
    redirect('/unauthorized');
  }

  // Determine effective role for filtering (priority: super_admin > hod > staff)
  const effectiveRole = effectiveRoles.has('super_admin')
    ? 'super_admin'
    : effectiveRoles.has('hod')
      ? 'hod'
      : effectiveRoles.has('staff')
        ? 'staff'
        : profile.role;

  // 4. Fetch pending requests with role-based filtering
  let filters: {
    status?: ChangeRequestStatus;
    institution_id?: string;
    department_id?: string;
  } = {};

  // Apply role-based filters
  if (effectiveRole === 'super_admin') {
    // Super Admin sees all requests (no filters)
    filters = {};
  } else if (effectiveRole === 'hod') {
    // HOD sees institution-wide requests
    filters = {
      institution_id: profile.institution_id || undefined,
    };
  } else if (effectiveRole === 'staff') {
    // Staff sees department-only requests
    filters = {
      department_id: profile.department_id || undefined,
    };
  }

  // Fetch all requests for each status (no pagination limit on server)
  let allRequests: Awaited<ReturnType<typeof LearnerProfileChangeService.getPendingRequests>>['data'] = [];

  try {
    const [pendingRequests, approvedRequests, rejectedRequests] = await Promise.all([
      LearnerProfileChangeService.getPendingRequests({
        ...filters,
        status: 'pending',
      }),
      LearnerProfileChangeService.getPendingRequests({
        ...filters,
        status: 'approved',
      }),
      LearnerProfileChangeService.getPendingRequests({
        ...filters,
        status: 'rejected',
      }),
    ]);

    allRequests = [
      ...pendingRequests.data,
      ...approvedRequests.data,
      ...rejectedRequests.data,
    ];
  } catch (error) {
    console.error('[change-requests-page] Error fetching requests:', error);
    // Continue with empty data rather than crashing the page
  }

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
        <ChangeRequestsClient initialData={allRequests} effectiveRole={effectiveRole} />
      </div>
    </ContentLayout>
  );
}
