'use client';

// app/(routes)/users/role-management/_components/permission-removal-warning-dialog.tsx
// ============================================================================
// The confirm an admin sees when they switch OFF a permission that real people
// are using. Director decision 9 (2026-08-05).
//
// It is a WARNING, not a block — the Director was explicit that it must not
// take away control. Continue is always available and always applies the
// change. The dialog is only reached when the count is greater than zero, so it
// never fires over a permission nobody holds.
// ============================================================================

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';

interface PermissionRemovalWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Human label for the permission, e.g. "View BoS External Expert Register". */
  permissionLabel: string;
  /** The raw key, shown small so an admin can search for it. */
  permissionKey: string;
  /** Distinct real people who hold this permission right now. Always > 0 here. */
  holderCount: number;
  onConfirm: () => void;
}

export function PermissionRemovalWarningDialog({
  open,
  onOpenChange,
  permissionLabel,
  permissionKey,
  holderCount,
  onConfirm
}: PermissionRemovalWarningDialogProps) {
  const peopleWord = holderCount === 1 ? 'person' : 'people';

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            This permission is used by {holderCount.toLocaleString()}{' '}
            {peopleWord}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Switching off <span className='font-medium'>{permissionLabel}</span>{' '}
            will remove their access. They will not see an error — the screens
            that need it will simply come up empty. Continue?
          </AlertDialogDescription>
        </AlertDialogHeader>

        <p className='text-xs text-muted-foreground -mt-2 break-all'>
          {permissionKey}
        </p>

        <AlertDialogFooter>
          {/* type='button' because this dialog is rendered inside the role-edit
              <form>: a bare <button> there defaults to submit, and answering
              the warning would save the whole role. Radix's portal already
              moves these out of the form element, so this is a second lock
              rather than the only one — but the portal is a Radix
              implementation detail and the submit default is not. */}
          <AlertDialogCancel type='button'>Keep it on</AlertDialogCancel>
          <AlertDialogAction type='button' onClick={onConfirm}>
            Switch it off
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
