'use client';

// Foundation — "Report a problem" control.
//
// One tap on any question in the bank. Open to anyone signed in, on purpose:
// a batch of AI-authored questions goes live having been sampled rather than
// read end to end, so the people who meet the unread ones are the only ones
// who can catch a bad one. Raising a report suppresses that question from
// mastery scoring until somebody with foundation.items.manage closes it.

import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Flag, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useRaiseItemFlag } from '@/hooks/foundation/use-foundation';
import type { ItemFlag } from '@/lib/services/foundation/foundation-service';

const MAX_REASON = 2000;

interface ItemFlagButtonProps {
  itemId: string;
  /** This viewer's own still-open report on this question, if they raised one. */
  existingFlag?: ItemFlag | null;
}

export function ItemFlagButton({ itemId, existingFlag }: ItemFlagButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const raise = useRaiseItemFlag();

  if (existingFlag) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Reported
      </span>
    );
  }

  async function handleSubmit() {
    try {
      await raise.mutateAsync({ itemId, reason: reason.trim() || null });
      toast.success(
        'Reported. A question stops counting toward mastery scores once enough different people have reported it — one report on its own does not remove it.',
      );
      setReason('');
      setOpen(false);
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not record the report');
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
        className="h-7 shrink-0 px-2 text-[11px] text-muted-foreground hover:text-amber-700 dark:hover:text-amber-400"
      >
        <Flag className="mr-1 h-3.5 w-3.5" />
        Report a problem
      </Button>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setReason('');
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Report a problem with this question</DialogTitle>
            <DialogDescription>
              Say what looks wrong. Your report is recorded straight away. A
              question only stops counting toward mastery scores once enough
              different people have reported the same one, and that change takes
              effect from the next recalculation — scores already on record do
              not move until then.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <Label htmlFor="fp-flag-reason">
              What is wrong with it?{' '}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="fp-flag-reason"
              value={reason}
              maxLength={MAX_REASON}
              onChange={(e) => setReason(e.target.value)}
              placeholder="For example: two options are both correct, or the answer key looks wrong."
              rows={4}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={raise.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={raise.isPending}
              className="bg-[#0b6d41] hover:bg-[#0a5c37]"
            >
              {raise.isPending && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              Send report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
