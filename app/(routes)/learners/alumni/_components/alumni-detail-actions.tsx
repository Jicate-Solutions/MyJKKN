'use client';
// ============================================
// ALUMNI DETAIL ACTIONS COMPONENT
// ============================================
// Created: 2026-03-22
// Purpose: Action buttons for alumni detail page
// ============================================


import { FileEdit } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import type { LearnerProfile } from '@/types/learner-profile';

interface AlumniDetailActionsProps {
  learner: LearnerProfile;
}

/**
 * AlumniDetailActions Component
 *
 * Displays action buttons for the alumni detail page.
 * Mirrors LearnerDetailActions but routes to /learners/alumni paths.
 *
 * Permissions:
 * - Edit: Requires 'learners' edit permission or super admin
 */
export function AlumniDetailActions({ learner }: AlumniDetailActionsProps) {
  const { canAccess, isSuperAdmin, isAdmissionGlobalUser, isLoading: permissionsLoading } = usePermissions();

  const hasEditPermission =
    !permissionsLoading && (isSuperAdmin || isAdmissionGlobalUser || canAccess('learners', 'edit'));

  return (
    <div className="flex items-center gap-2">
      {hasEditPermission && (
        <Button asChild>
          <Link href={`/learners/alumni/${learner.id}/edit`}>
            <FileEdit className="mr-2 h-4 w-4" />
            Edit Profile
          </Link>
        </Button>
      )}
    </div>
  );
}
