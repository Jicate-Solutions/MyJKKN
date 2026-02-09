// ============================================
// CHANGE REQUEST DETAIL PAGE (SERVER COMPONENT)
// ============================================
// Created: 2025-01-20
// Purpose: Display change request details with comparison view for HOD/Staff approval
// ============================================

import { redirect } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { LearnerProfileChangeService } from '@/lib/services/learner-profile-change-service';
import { RequestDetailClient } from './_components/request-detail-client';

interface RequestDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Change Request Detail Page - Server Component
 *
 * Features:
 * - Role-based access (HOD/Staff/Super Admin only)
 * - Permission verification (can user approve this request?)
 * - Full request details with learner profile
 * - Side-by-side comparison view
 * - Approval/Rejection actions
 */
export default async function RequestDetailPage({ params }: RequestDetailPageProps) {
  const { id } = await params;
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

  // 4. Fetch change request with full learner data
  let request;
  try {
    request = await LearnerProfileChangeService.getChangeRequest(id);
  } catch (error) {
    console.error('[learners/change-requests/[id]] Error fetching request:', error);
    return (
      <ContentLayout title="Request Not Found">
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">Request Not Found</h2>
          <p className="text-muted-foreground mb-4">
            {error instanceof Error ? error.message : 'The requested change request could not be found.'}
          </p>
          <Button asChild>
            <Link href="/learners/change-requests">Back to Change Requests</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  // 5. Verify permission to view this request
  if (!request.learner) {
    return (
      <ContentLayout title="Invalid Request">
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">Invalid Request</h2>
          <p className="text-muted-foreground mb-4">
            Request data is incomplete or corrupted.
          </p>
          <Button asChild>
            <Link href="/learners/change-requests">Back to Change Requests</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  // Check role-based permission (using effective roles for multi-role support)
  let hasPermission = false;

  if (effectiveRoles.has('super_admin')) {
    // Super Admin can view all requests
    hasPermission = true;
  } else if (effectiveRoles.has('hod')) {
    // HOD can view institution-wide requests
    hasPermission = request.learner.institution_id === profile.institution_id;
  } else if (effectiveRoles.has('staff')) {
    // Staff can view department-only requests
    hasPermission = request.learner.department_id === profile.department_id;
  }

  if (!hasPermission) {
    redirect('/unauthorized');
  }

  // 6. Build full learner profile for display
  const { data: fullLearner } = await supabase
    .from('learners_profiles')
    .select(`
      *,
      institution:institutions(id, name),
      department:departments(id, department_name),
      program:programs(id, program_name)
    `)
    .eq('id', request.learner_id)
    .single();

  if (!fullLearner) {
    return (
      <ContentLayout title="Learner Not Found">
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">Learner Not Found</h2>
          <p className="text-muted-foreground mb-4">
            The learner associated with this request could not be found.
          </p>
          <Button asChild>
            <Link href="/learners/change-requests">Back to Change Requests</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  // Combine request with full learner data
  const requestWithFullLearner = {
    ...request,
    learner: fullLearner,
  };

  return (
    <ContentLayout title="Change Request Details">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learners' },
          { label: 'Change Requests', href: '/learners/change-requests' },
          { label: 'Request Details' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header with Back Button */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Change Request Details
            </h1>
            <p className="text-muted-foreground">
              Review and manage student profile change request
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/learners/change-requests">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to List
            </Link>
          </Button>
        </div>

        {/* Client Component with Request Data */}
        <RequestDetailClient request={requestWithFullLearner} userId={user.id} />
      </div>
    </ContentLayout>
  );
}
