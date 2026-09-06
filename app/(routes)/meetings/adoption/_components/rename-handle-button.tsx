'use client';

// app/(routes)/meetings/adoption/_components/rename-handle-button.tsx
//
// The button the host-facing message has been pointing at since June.
// savePublicPage() tells a leader "Contact an administrator to change it"; this
// is what the administrator clicks.
//
// It only renders for someone who already has an address. A leader with no page
// has nothing to rename, and the scoreboard shows plenty of those.

import { useState, useTransition } from 'react';
import { Pencil } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { renameHostHandle } from '../actions';

interface RenameHandleButtonProps {
  hostProfileId: string;
  currentHandle: string;
  personName: string;
}

export function RenameHandleButton({
  hostProfileId,
  currentHandle,
  personName,
}: RenameHandleButtonProps) {
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState(currentHandle);
  const [reason, setReason] = useState('');
  const [pending, startTransition] = useTransition();

  const unchanged = handle.trim().toLowerCase() === currentHandle.toLowerCase();

  function submit() {
    startTransition(async () => {
      const result = await renameHostHandle({
        hostProfileId,
        newHandle: handle,
        reason,
      });

      if (!result.success) {
        // Show the reason, not a generic failure — the action returns sentences
        // a non-technical admin can act on ("already in use", "reserved").
        toast.error(result.error ?? 'Could not change the address.');
        return;
      }

      toast.success(
        `Address changed to /meet/${result.data?.handle}. The old link still works and forwards here.`,
      );
      setOpen(false);
      setReason('');
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={() => {
          setHandle(currentHandle);
          setOpen(true);
        }}
      >
        <Pencil className="mr-1 h-3 w-3" />
        <span className="sr-only sm:not-sr-only">Change address</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change booking address</DialogTitle>
            <DialogDescription>
              {personName} currently books at{' '}
              <code className="rounded bg-muted px-1">/meet/{currentHandle}</code>. Their
              own settings lock this once their page is live, so only an administrator
              can change it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-handle">New address</Label>
              <div className="flex items-center gap-1">
                <span className="shrink-0 text-sm text-muted-foreground">/meet/</span>
                <Input
                  id="new-handle"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value.toLowerCase())}
                  className="font-mono"
                  placeholder="their-name"
                  disabled={pending}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers and single hyphens. 3–50 characters.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rename-reason">
                Reason <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="rename-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. name spelled wrong at sign-up"
                disabled={pending}
              />
              <p className="text-xs text-muted-foreground">
                Saved with the old address, so anyone looking at this later can see why
                it changed.
              </p>
            </div>

            {/* The single most important thing for an admin to know before
                clicking, so it is stated plainly rather than left to be
                discovered when someone complains a link died. */}
            <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              <code className="rounded bg-background px-1">/meet/{currentHandle}</code> will
              keep working and send visitors to the new address, so links already shared
              in emails and signatures will not break.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="button" onClick={submit} disabled={pending || unchanged}>
              {pending ? 'Changing…' : 'Change address'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
