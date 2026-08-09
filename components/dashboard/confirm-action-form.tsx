'use client';

/**
 * Dashboard v2 — a confirmation step in front of a one-tap Server Action.
 *
 * SCOPE, as of 2026-08-09 (PR #2940): exactly ONE caller — "🔥 Broadcast
 * rescue" in decision-queue-item.tsx.
 *
 * This wrapped the Decision Queue's Approve / Reject / Close lead buttons too.
 * Those now take one tap and put an undo bar up for ~8 seconds instead
 * (fn_dashboard_queue_undo, migration 20260817020000): the Director's call was
 * that confirm-before AND undo-after is double friction, and a dialog in front
 * of something you can take back only teaches people to dismiss dialogs unread.
 *
 * Broadcast rescue keeps its dialog because it is the one action here that
 * genuinely cannot be reversed by any database write: it alerts the counselling
 * team the moment it fires. Ask first is the only protection available, so it
 * stays. Do not "unify" this away.
 *
 * Mechanism: wraps the form in the repo's existing Radix AlertDialog
 * (components/ui/alert-dialog.tsx — the pattern already used by
 * shared/crud-master/crud-row-actions.tsx and archive-initiative-dialog.tsx).
 * No new confirm mechanism, and no change to the Server Action: the form, its
 * hidden inputs and its idempotency key are untouched, the submit is just gated
 * behind a second, deliberate tap.
 */

import * as React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';

export type ConfirmCopy = {
  /** Names the act, e.g. "Reject this request" — never "Are you sure?". */
  title: string;
  /** What the tap will actually do, in plain words, naming the item. */
  description: React.ReactNode;
  /** Label on the button that actually commits, e.g. "Reject". */
  confirmLabel: string;
  /** 'destructive' tints the commit button crimson. Defaults to destructive. */
  tone?: 'default' | 'destructive';
};

type ConfirmActionFormProps = ConfirmCopy & {
  /** The Server Action this form posts to. Unchanged by the confirmation. */
  formAction: (formData: FormData) => void | Promise<void>;
  /** Hidden inputs — rendered on the server by the caller. */
  children: React.ReactNode;
  /** Label on the card's own button (the one that opens the dialog). */
  label: string;
  /** Card button styling, so a confirmed button looks like every other one. */
  buttonClassName: string;
};

export function ConfirmActionForm({
  formAction,
  children,
  label,
  buttonClassName,
  title,
  description,
  confirmLabel,
  tone = 'destructive'
}: ConfirmActionFormProps) {
  const formRef = React.useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={formAction} className='inline-block'>
      {children}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          {/* type='button' — this opens the dialog, it must not submit. */}
          <button type='button' className={buttonClassName}>
            {label}
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              /*
               * requestSubmit() rather than a submit button inside the dialog:
               * AlertDialogContent is portalled to <body>, so a button in there
               * is outside this <form> in the DOM and would never post it.
               * The form itself is not portalled, so it is still mounted here
               * when Radix closes the dialog on this same click.
               */
              onClick={() => formRef.current?.requestSubmit()}
              className={
                tone === 'destructive'
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : undefined
              }
            >
              {confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
