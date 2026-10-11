'use client';

// Q-1010-395: "Reset source" on a kit rule item (store admins only). Resetting
// an item that sits in a rule blocks hand-over at the counter until a store
// admin sets the source again (fn_kit_record_collection, D32), so the action
// asks first (desk decision 11 Oct).

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export const RESET_KIT_SOURCE_CONFIRM =
  "Reset this item's source? Until a store admin sets it again, the counter can't hand this item over.";

export function ResetKitSourceButton({
  disabled,
  onConfirm,
}: {
  disabled?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled}
        title="Clear this item's kit source (store admin)"
        onClick={() => setOpen(true)}
      >
        Reset source
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset source</AlertDialogTitle>
          <AlertDialogDescription>{RESET_KIT_SOURCE_CONFIRM}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setOpen(false);
              void onConfirm();
            }}
          >
            Reset source
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
