'use client';

// Inline active/inactive toggle for a leave-type table row.

import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/use-auth';
import { useToggleLearnerLeaveType } from '@/hooks/learners/use-learner-leave-types';
import type { LearnerLeaveType } from '@/types/learner-leave-types';

export function LeaveTypeActiveSwitch({
  leaveType,
  disabled,
}: {
  leaveType: LearnerLeaveType;
  disabled?: boolean;
}) {
  const { profile } = useAuth();
  const toggle = useToggleLearnerLeaveType();

  return (
    <Switch
      checked={leaveType.is_active}
      disabled={disabled || toggle.isPending || !profile?.id}
      onCheckedChange={(checked) => {
        if (!profile?.id) return;
        toggle.mutate({ id: leaveType.id, is_active: checked, userId: profile.id });
      }}
      aria-label={leaveType.is_active ? 'Deactivate leave type' : 'Activate leave type'}
    />
  );
}
