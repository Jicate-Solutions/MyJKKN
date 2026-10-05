'use client';

// Admin: "Sign out of all devices" for the person on /users/[id].
// Shown only to a super admin or a role holding users.sessions.revoke; the
// database function enforces the same rule, so hiding the button is a
// convenience, not the safety.
//
// "Super admin" here means the profiles.is_super_admin FLAG — the same test the
// database uses (is_super_admin(), user_has_permission(text) and every RLS
// policy). usePermissions() also treats profiles.role = 'super_admin' as super
// admin, but for such an account WITHOUT the flag the database refuses this
// action, so the button stays hidden for it rather than offering a refusal. Two steps: nothing happens until the confirm
// button is pressed. Every refusal is shown here, never a redirect.

import { useState, useTransition } from 'react';
import { LogOut, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import { SIGNED_OUT_EVERYWHERE_NOTICE } from '@/lib/auth/sign-out-everywhere-copy';
import { revokeUserSessions } from '../_actions/revoke-user-sessions';

interface RevokeSessionsButtonProps {
  userId: string;
  userName: string;
}

export function RevokeSessionsButton({ userId, userName }: RevokeSessionsButtonProps) {
  const { canAccess, isLoading, isSuperAdmin, userProfile } = usePermissions();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasSuperAdminFlag = userProfile?.is_super_admin === true;
  // A role-only "super admin" (no flag) gets no permission map from the hook,
  // and the database would refuse it — so it is not shown the button.
  const canRevoke =
    hasSuperAdminFlag || (!isSuperAdmin && canAccess('users.sessions', 'revoke'));

  if (isLoading || !canRevoke) return null;

  const handleConfirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await revokeUserSessions(userId);
      if (result.success === false) {
        setError(result.error);
        return;
      }
      setConfirming(false);
      toast.success(
        result.sessionsEnded > 0
          ? `${userName}: ${SIGNED_OUT_EVERYWHERE_NOTICE} (${result.sessionsEnded} login${result.sessionsEnded === 1 ? '' : 's'} ended.)`
          : `No active logins were found for ${userName}. Nothing to end.`
      );
    });
  };

  return (
    <div className='rounded-md border p-3 space-y-3'>
      {confirming ? (
        <div className='space-y-3'>
          <p className='flex items-start gap-2 text-sm font-medium'>
            <ShieldAlert className='mt-0.5 h-4 w-4 shrink-0 text-destructive' />
            This signs {userName} out on every phone and computer. They will
            need to sign in again.
          </p>
          <div className='flex flex-col gap-2 sm:flex-row'>
            <Button
              variant='destructive'
              onClick={handleConfirm}
              disabled={isPending}
            >
              {isPending ? 'Signing out…' : 'Yes, sign them out everywhere'}
            </Button>
            <Button
              variant='outline'
              onClick={() => {
                setConfirming(false);
                setError(null);
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
          <p className='text-sm text-muted-foreground'>
            Lost or shared phone? End every login to this account.
          </p>
          <Button variant='outline' onClick={() => setConfirming(true)}>
            <LogOut className='mr-2 h-4 w-4' />
            Sign out of all devices
          </Button>
        </div>
      )}

      {error && (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      )}
    </div>
  );
}
