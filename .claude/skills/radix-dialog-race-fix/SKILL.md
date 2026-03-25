---
name: radix-dialog-race-fix
description: This skill should be used when implementing nested dialogs, confirmation dialogs, or multi-step dialog flows using shadcn/ui or Radix UI. It resolves race conditions that occur when opening an AlertDialog from within a Dialog's onOpenChange handler, which can cause pointer events to get trapped, overlays to persist invisibly, or the page to become stuck/unresponsive. Use this skill when working with Dialog + AlertDialog combinations, delete confirmations, unsaved changes prompts, or any scenario where one dialog needs to open another.
---

# Radix UI Dialog Race Condition Fix

## Problem Overview

When using Radix UI (or shadcn/ui) Dialog and AlertDialog together, interrupting a Dialog's close event (`onOpenChange`) to open an AlertDialog can cause race conditions in the underlying library. This leads to:

- **Stuck page**: Body remains locked with `pointer-events: none`
- **Invisible overlays**: Overlays persist but are not visible
- **Unresponsive UI**: Page cannot receive clicks or interactions
- **State desync**: Dialog states become out of sync with the DOM

## Root Cause

Radix UI manages focus, overlays, and pointer events through internal state machines. When two dialogs attempt to change state simultaneously:

1. Dialog A starts closing (begins cleanup)
2. AlertDialog B opens (begins setup)
3. Race condition: cleanup and setup interleave unpredictably
4. Result: DOM left in inconsistent state

## Solution Pattern

**Decouple dialog state changes with `setTimeout`** to ensure each dialog's state machine completes before the next begins.

### Core Implementation Pattern

```typescript
import { useState, useCallback, useRef } from 'react';

export function useDialogWithConfirmation() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const pendingCloseRef = useRef(false);

  // Handle main dialog close attempt
  const handleDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      // User trying to close - show confirmation
      pendingCloseRef.current = true;

      // CRITICAL: Delay opening confirmation to let Dialog's close event settle
      setTimeout(() => {
        setIsConfirmOpen(true);
      }, 0);
    } else {
      setIsDialogOpen(true);
    }
  }, []);

  // Handle confirmation result
  const handleConfirmClose = useCallback((confirmed: boolean) => {
    // CRITICAL: Close AlertDialog first and let it clean up
    setIsConfirmOpen(false);

    if (confirmed && pendingCloseRef.current) {
      // CRITICAL: Delay closing main dialog to let AlertDialog cleanup complete
      setTimeout(() => {
        setIsDialogOpen(false);
        pendingCloseRef.current = false;
      }, 0);
    } else {
      pendingCloseRef.current = false;
    }
  }, []);

  return {
    isDialogOpen,
    setIsDialogOpen,
    isConfirmOpen,
    handleDialogOpenChange,
    handleConfirmClose,
  };
}
```

### Component Usage Example

```tsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

export function FormDialog({
  open,
  onOpenChange,
  hasUnsavedChanges
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasUnsavedChanges: boolean;
}) {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && hasUnsavedChanges) {
      // Delay showing confirmation dialog
      setTimeout(() => {
        setShowConfirm(true);
      }, 0);
      return; // Don't close yet
    }
    onOpenChange(newOpen);
  };

  const handleConfirmDiscard = () => {
    setShowConfirm(false);
    // Delay closing main dialog
    setTimeout(() => {
      onOpenChange(false);
    }, 0);
  };

  const handleCancelDiscard = () => {
    setShowConfirm(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Form</DialogTitle>
          </DialogHeader>
          {/* Form content */}
        </DialogContent>
      </Dialog>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to discard them?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDiscard}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDiscard}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

## Scenario-Specific Patterns

### Delete Confirmation Pattern

```tsx
function DeleteItemDialog({
  item,
  open,
  onOpenChange,
  onDelete
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDeleteClick = () => {
    // Delay opening confirmation
    setTimeout(() => {
      setShowDeleteConfirm(true);
    }, 0);
  };

  const handleConfirmDelete = async () => {
    setShowDeleteConfirm(false);

    // Delay the actual deletion and dialog close
    setTimeout(async () => {
      await onDelete(item.id);
      onOpenChange(false);
    }, 0);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          {/* Item details */}
          <Button variant="destructive" onClick={handleDeleteClick}>
            Delete
          </Button>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {item.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

### Multi-Step Dialog Pattern

```tsx
function MultiStepDialog({ open, onOpenChange }) {
  const [step, setStep] = useState(1);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && step > 1) {
      // User trying to close mid-flow
      setTimeout(() => {
        setShowExitConfirm(true);
      }, 0);
      return;
    }
    if (!newOpen) {
      setStep(1); // Reset on close
    }
    onOpenChange(newOpen);
  };

  const handleNextStep = () => {
    // No setTimeout needed - same dialog, just content change
    setStep(prev => prev + 1);
  };

  const handleConfirmExit = () => {
    setShowExitConfirm(false);
    setTimeout(() => {
      setStep(1);
      onOpenChange(false);
    }, 0);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          {step === 1 && <Step1 onNext={handleNextStep} />}
          {step === 2 && <Step2 onNext={handleNextStep} />}
          {step === 3 && <Step3 onComplete={() => onOpenChange(false)} />}
        </DialogContent>
      </Dialog>

      <AlertDialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Exit wizard?</AlertDialogTitle>
            <AlertDialogDescription>
              Your progress will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continue</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmExit}>
              Exit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

## Reusable Hook

For consistent implementation across the codebase, use this reusable hook:

```typescript
// hooks/use-dialog-confirmation.ts
import { useState, useCallback, useRef } from 'react';

interface UseDialogConfirmationOptions {
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
  shouldConfirm?: () => boolean;
}

export function useDialogConfirmation(options: UseDialogConfirmationOptions = {}) {
  const { onConfirm, onCancel, shouldConfirm = () => true } = options;

  const [isMainOpen, setIsMainOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleMainOpenChange = useCallback((open: boolean) => {
    if (!open && shouldConfirm()) {
      // Opening confirmation - delay to prevent race condition
      setTimeout(() => {
        setIsConfirmOpen(true);
      }, 0);
      return;
    }
    setIsMainOpen(open);
  }, [shouldConfirm]);

  const handleConfirm = useCallback(async () => {
    setIsProcessing(true);
    setIsConfirmOpen(false);

    try {
      if (onConfirm) {
        await onConfirm();
      }
      // Delay closing main dialog
      setTimeout(() => {
        setIsMainOpen(false);
        setIsProcessing(false);
      }, 0);
    } catch (error) {
      setIsProcessing(false);
      throw error;
    }
  }, [onConfirm]);

  const handleCancelConfirm = useCallback(() => {
    setIsConfirmOpen(false);
    onCancel?.();
  }, [onCancel]);

  const openDialog = useCallback(() => {
    setIsMainOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setIsMainOpen(false);
  }, []);

  return {
    isMainOpen,
    isConfirmOpen,
    isProcessing,
    handleMainOpenChange,
    handleConfirm,
    handleCancelConfirm,
    openDialog,
    closeDialog,
  };
}
```

## Key Rules

1. **Always use `setTimeout(() => {}, 0)`** when opening a dialog in response to another dialog's close event
2. **Always close the inner dialog first** before closing the outer dialog
3. **Use refs for pending state** to track intentions across the async boundary
4. **Never call both `setDialogAOpen(false)` and `setDialogBOpen(true)` synchronously**
5. **Test the escape key and overlay click** - these are common sources of race conditions

## Debugging Stuck State

If the page becomes stuck despite using this pattern:

```typescript
// Emergency reset function - use sparingly
function resetDialogState() {
  // Remove stuck pointer-events
  document.body.style.pointerEvents = '';

  // Remove any stuck Radix overlays
  document.querySelectorAll('[data-radix-portal]').forEach(el => {
    if (!el.querySelector('[data-state="open"]')) {
      el.remove();
    }
  });
}
```

## Checklist for Implementation

When implementing nested dialogs:

- [ ] Opening confirmation dialog uses `setTimeout`
- [ ] Confirming action closes AlertDialog first, then delays main action
- [ ] Canceling returns cleanly without race conditions
- [ ] Escape key tested for both dialogs
- [ ] Overlay click tested for both dialogs
- [ ] Multiple rapid open/close cycles tested
- [ ] Form state (if any) preserved correctly through confirmation flow
