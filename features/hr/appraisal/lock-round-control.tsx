'use client';

/**
 * The "Move to Locked" step for an appraisal round (round-5 review).
 *
 * Locking hands the round to the committee. After it, neither the person nor
 * their head of department can act on an appraisal. So:
 *   - While any appraisal is still waiting for its head, the lock is
 *     refused, with the count. The service and a database trigger refuse it
 *     too; this only says so before the click.
 *   - Appraisals still in draft do not block, but those people are left out
 *     of the round. The admin has to confirm that here, on the page. A
 *     browser confirm box is not used, because the viewer suppresses it.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { lockBlockedMessage } from '@/lib/services/hr/performance-review-service';

interface Props {
  /** Appraisals in this round still waiting for their head (self_submitted). */
  pending: number;
  /** Appraisals started but never submitted (draft). */
  drafts: number;
  busy: boolean;
  onLock: () => void;
}

export function LockRoundControl({ pending, drafts, busy, onLock }: Props) {
  const [confirming, setConfirming] = useState(false);

  if (pending > 0) {
    return (
      <div className="space-y-2">
        <Button size="sm" disabled>
          Move to Locked
        </Button>
        <p className="text-sm text-muted-foreground">{lockBlockedMessage(pending)}</p>
      </div>
    );
  }

  if (confirming) {
    const who = drafts === 1 ? '1 person' : `${drafts} people`;
    return (
      <div className="space-y-3 rounded-md border border-amber-600/40 bg-amber-600/5 p-3">
        <p className="text-sm font-medium">
          {who} started an appraisal but never submitted it.
        </p>
        <p className="text-sm text-muted-foreground">
          Locking leaves them out of this round. Their drafts stay as they are and can no
          longer be submitted. People who never opened the form are not counted here.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busy}
            onClick={() => {
              setConfirming(false);
              onLock();
            }}
          >
            Lock and leave {who} out
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button
      size="sm"
      disabled={busy}
      onClick={() => (drafts > 0 ? setConfirming(true) : onLock())}
    >
      Move to Locked
    </Button>
  );
}
