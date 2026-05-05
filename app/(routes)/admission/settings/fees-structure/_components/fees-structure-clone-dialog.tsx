'use client';

// fees-structure-clone-dialog.tsx
//
// Stub for Task 13. Full implementation in Task 15.

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { FeeStructureMatrixDimensions } from '@/types/admission';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceDims: Partial<FeeStructureMatrixDimensions>;
  onCloned?: () => void;
}

export function FeesStructureCloneDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clone Fee Structure</DialogTitle>
          <DialogDescription>
            Clone-mode editor lands in Task 15.
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
