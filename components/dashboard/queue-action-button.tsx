'use client';

/**
 * Dashboard v2 — a one-tap Decision Queue action with an undo bar behind it.
 *
 * WHY THIS SHAPE
 *   Six buttons on a queue card are final. The round before this put a confirm
 *   dialog in front of three of them; the Director chose the other shape
 *   instead — every final action stays ONE tap, and an undo appears for ~8
 *   seconds afterwards. Confirm-before and undo-after together is double
 *   friction, and a dialog in front of an action you can take back just trains
 *   people to dismiss dialogs unread.
 *
 * WHY NOT useActionState
 *   The obvious build is <form action={...}> + useActionState + a useEffect
 *   that raises the toast when state changes. It drops toasts. A successful
 *   terminal action revalidates /dashboard, the item leaves the queue, and this
 *   button unmounts — potentially in the same commit that delivers the new
 *   state, so the effect never runs and the reader gets no undo for the action
 *   most in need of one. Instead the server action is awaited inside a
 *   transition and the toast is raised from that closure: sonner's `toast()` is
 *   a global imperative store outside React, so it fires whether or not the
 *   button that started it is still on the page.
 *
 *   The cost of that choice, stated: the form no longer works with JavaScript
 *   disabled. The undo bar is a JS affordance either way, so a no-JS reader
 *   would have got the irreversible half of this feature and none of the safety
 *   half — worse than not offering it.
 *
 * WHAT GETS A TOAST
 *   The four terminal actions (approve / reject / acknowledge / false_alarm)
 *   get a named toast and an Undo. snooze and Skip get neither — they are
 *   already recoverable and noise on safe actions is what makes people ignore
 *   the important ones. Failures are announced for every action including
 *   snooze: a silent failure is the bug d7dc6bd620 fixed, not noise.
 */

import * as React from 'react';
import { toast } from 'sonner';
import {
  performQueueAction,
  undoQueueAction
} from '@/app/(routes)/dashboard/_actions/queue-actions';

const UNDO_WINDOW_MS = 8000;

export type QueueActionButtonProps = {
  action: string;
  /** Label on the button, e.g. "✓ Approve". */
  label: string;
  /**
   * Past-tense name of what just happened, e.g. "Approved". Comes from the
   * button rather than the action because three different buttons post
   * action='reject' ("✕ Reject" and "Close lead") or 'acknowledge'
   * ("Mark resolved" and "Acknowledge"), and "Rejected — …" would be the wrong
   * sentence for closing a lead.
   *
   * Absent ⇒ this action is recoverable and gets no success toast.
   */
  doneLabel?: string;
  /** The item's own title, so the toast names the thing and not just the act. */
  itemTitle: string;
  className: string;
  userNotificationId: string;
  groupIds?: string[];
  extraFields?: Record<string, string>;
};

export function QueueActionButton({
  action,
  label,
  doneLabel,
  itemTitle,
  className,
  userNotificationId,
  groupIds,
  extraFields = {}
}: QueueActionButtonProps) {
  const [pending, startTransition] = React.useTransition();

  function runUndo(targets: string[]) {
    const id = toast.loading('Putting it back…');
    // Not awaited by the caller: this runs from the toast's own button, which
    // has no React tree of its own to keep alive.
    void undoQueueAction({ targets })
      .then((res) => {
        if (res.ok) toast.success(res.message, { id });
        else toast.error(res.message, { id });
      })
      .catch((err) => {
        console.error('[dashboard/queue-undo] client error:', err);
        toast.error("Couldn't undo that — refresh to see where things stand.", {
          id
        });
      });
  }

  function submit(formData: FormData) {
    startTransition(async () => {
      let res;
      try {
        res = await performQueueAction(formData);
      } catch (err) {
        console.error('[dashboard/queue-action] client error:', err);
        toast.error("That didn't go through. Try again.");
        return;
      }

      if (!res.ok) {
        toast.error(res.message ?? "That didn't go through. Try again.");
        return;
      }

      // Recoverable action (snooze / Skip): it worked, say nothing.
      if (!doneLabel) return;

      const targets = res.undoTargets;

      // A grouped dismissal can PARTIALLY fail. performQueueAction stops at the
      // first refusal that comes after the visible row has already landed, and
      // still returns ok:true — with applied < requested. Reporting that as
      // "all 3 runs" is a success toast for work that did not happen, and the
      // rows left behind reappear on the next render as if the tap were
      // ignored. Say how many of how many, the way the undo path already does.
      const partial = res.applied < res.requested;
      const runs =
        res.requested > 1
          ? partial
            ? ` · ${res.applied} of ${res.requested} runs`
            : ` · all ${res.applied} runs`
          : '';
      const headline = `${doneLabel} — ${itemTitle}${runs}`;

      if (partial) {
        // Not toast.success: some of what was asked for did not happen. The
        // undo, when offered, covers only the rows that did.
        toast.warning(`${headline} — the rest did not go through.`, {
          duration: UNDO_WINDOW_MS,
          action:
            targets.length > 0
              ? { label: 'Undo', onClick: () => runUndo(targets) }
              : undefined
        });
        return;
      }

      if (targets.length === 0) {
        // Terminal, but nothing changed this time round (an idempotent replay
        // of a submit that already landed). Confirm it without offering an
        // undo that would reverse a different, earlier act.
        toast(headline, { duration: UNDO_WINDOW_MS });
        return;
      }

      toast(headline, {
        duration: UNDO_WINDOW_MS,
        action: { label: 'Undo', onClick: () => runUndo(targets) }
      });
    });
  }

  return (
    <form action={submit} className='inline-block'>
      <input type='hidden' name='userNotificationId' value={userNotificationId} />
      <input type='hidden' name='action' value={action} />
      {groupIds && groupIds.length > 1 && (
        <input
          type='hidden'
          name='userNotificationIds'
          value={groupIds.join(',')}
        />
      )}
      <input
        type='hidden'
        name='idempotencyKey'
        value={`${userNotificationId}:${action}`}
      />
      {Object.entries(extraFields).map(([k, v]) => (
        <input key={k} type='hidden' name={k} value={v} />
      ))}
      {/* Dimmed and disabled while in flight. Without it a slow action gives no
          feedback at all between the tap and the toast, and the reader taps
          again — on a button whose whole point is that one tap is enough. */}
      <button
        type='submit'
        className={`${className} disabled:opacity-60 disabled:cursor-not-allowed`}
        disabled={pending}
        aria-busy={pending}
      >
        {label}
      </button>
    </form>
  );
}
