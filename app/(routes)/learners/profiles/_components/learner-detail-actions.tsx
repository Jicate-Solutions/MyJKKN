// ============================================
// LEARNER DETAIL ACTIONS COMPONENT
// ============================================
// Created: 2025-01-19
// Purpose: Action buttons for learner detail page
// ============================================

'use client';

import { FileEdit } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import type { LearnerProfile } from '@/types/learner-profile';

interface LearnerDetailActionsProps {
  learner: LearnerProfile;
}

/**
 * LearnerDetailActions Component
 *
 * Displays action buttons for the learner detail page
 *
 * Permissions:
 * - Edit: Requires 'learners' edit permission or super admin
 */
export function LearnerDetailActions({ learner }: LearnerDetailActionsProps) {
  const { canAccess, isSuperAdmin, isLoading: permissionsLoading } = usePermissions();

  // Only access permissions after they've loaded
  const hasEditPermission =
    !permissionsLoading && (isSuperAdmin || canAccess('learners', 'edit'));

  return (
    <div className="flex items-center gap-2">
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
