'use client';
// ============================================
// LEARNER DETAIL ACTIONS COMPONENT
// ============================================
// Created: 2025-01-19
// Purpose: Action buttons for learner detail page
// ============================================


import { FileEdit, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import type { LearnerProfile, LifecycleStatus } from '@/types/learner-profile';

interface LearnerDetailActionsProps {
  learner: LearnerProfile;
}

// R4.2 — statuses where a learner is a strong hiring candidate
const HIREABLE_STATUSES: LifecycleStatus[] = ['graduated', 'alumni'];
// TODO: add 'active' with final-year detection when that field is available

/**
 * LearnerDetailActions Component
 *
 * Displays action buttons for the learner detail page
 *
 * Permissions:
 * - Edit: Requires 'learners' edit permission or super admin
 * - Consider for Hiring (R4.2): Requires 'hr.recruitment' create permission or super admin
 */
export function LearnerDetailActions({ learner }: LearnerDetailActionsProps) {
  const { canAccess, isSuperAdmin, isAdmissionGlobalUser, isLoading: permissionsLoading } = usePermissions();

  // Only access permissions after they've loaded
  const hasEditPermission =
    !permissionsLoading && (isSuperAdmin || isAdmissionGlobalUser || canAccess('learners', 'edit'));

  // R4.2 — only show the hiring button when learner is in a hireable status
  const isHireable = HIREABLE_STATUSES.includes(learner.lifecycle_status as LifecycleStatus);
  const canCreateRecruitment = !permissionsLoading && (isSuperAdmin || canAccess('hr.recruitment', 'create'));

  // Build cross-profile URL: pre-fill name + email, tag source as learner_graduate
  const learnerName = `${learner.first_name} ${learner.last_name ?? ''}`.trim();
  const learnerEmail = learner.college_email ?? learner.student_email ?? '';
  const considerForHiringUrl =
    `/hr/recruitment/submit?source=learner_graduate` +
    `&name=${encodeURIComponent(learnerName)}` +
    `&email=${encodeURIComponent(learnerEmail)}`;

  return (
    <div className="flex items-center gap-2">
      {/* R4.2 — Learner → Candidate entry point */}
      {isHireable && canCreateRecruitment && (
        <Button variant="outline" asChild>
          <Link href={considerForHiringUrl}>
            <UserPlus className="mr-2 h-4 w-4" />
            Consider for Hiring
          </Link>
        </Button>
      )}
      {hasEditPermission && (
        <Button asChild>
          <Link href={`/learners/profiles/${learner.id}/edit`}>
            <FileEdit className="mr-2 h-4 w-4" />
            Edit Profile
          </Link>
        </Button>
      )}
    </div>
  );
}
