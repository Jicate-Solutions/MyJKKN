'use client';

/**
 * Dashboard v2 — a confirmation step in front of a one-tap Server Action.
 *
 * The Decision Queue's action buttons are bare `<form action={serverAction}>`
 * submits: one tap runs fn_dashboard_queue_action, which sets
 * user_notifications.acknowledged_at and stamps notifications.acted_by with the
 * caller. There is no un-acknowledge action in that function's enum
 * (supabase/setup/02_functions.sql:6411) — so the tap is final, and on a 387px
 * phone Approve and Reject sit about 10px apart.
 *
 * This wraps the *same* form in the repo's existing Radix AlertDialog
 * (components/ui/alert-dialog.tsx — the pattern already used by
 * shared/crud-master/crud-row-actions.tsx and archive-initiative-dialog.tsx).
 * No new confirm mechanism, and no change to the Server Action or the RPC: the
 * form, its hidden inputs and its idempotency key are untouched, the submit is
 * just gated behind a second, deliberate tap.
 *
 * Only genuinely irreversible actions are given one. Snooze, Acknowledge and
 * False alarm stay a single tap on purpose — a dialog in front of a recoverable
 * action only teaches people to dismiss dialogs without reading them.
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
