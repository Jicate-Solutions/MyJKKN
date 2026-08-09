/**
 * Dashboard v2 — Decision Queue Server Actions
 * All exports here are Server Actions (per Next.js 'use server' contract).
 *
 * Called from components/dashboard/queue-action-button.tsx.
 * Idempotency: each action carries an idempotency_key = `${user_notification_id}:${action}`
 * to survive double-submits (Round 4.15 decision).
 *
 * Spec: specs/myjkkn-dashboard-v2-spec.md §4.2, §7.2
 */

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type QueueAction =
  | 'approve'
  | 'reject'
  | 'delegate'
  | 'snooze'
  | 'acknowledge'
  | 'false_alarm';

/**
 * The four actions that set user_notifications.acknowledged_at from the queue
 * and can therefore be reversed by fn_dashboard_queue_undo. snooze only defers
 * (it moves created_at), and delegate also puts a row in somebody else's queue,
 * so neither is offered an undo.
 */
const UNDOABLE_ACTIONS: readonly QueueAction[] = [
  'approve',
  'reject',
  'acknowledge',
  'false_alarm'
];

/**
 * What the client learns about a completed action.
 *
 * performQueueAction used to return void, so the page could only tell the
 * reader what had happened by re-rendering — which is exactly what it cannot do
 * for an action whose whole point is that the card disappears. The undo bar
 * needs three things back: whether it worked, which rows to reverse, and a
 * sentence to show if it did not.
 *
 * `runId` exists so the caller can tell two identical outcomes apart.
 */
export type QueueActionOutcome = {
  runId: string;
  ok: boolean;
  action?: QueueAction;
  /** Rows actually acted on — the group case can be more than one. */
  applied: number;
  /** Rows the caller asked for. applied < requested ⇒ a partial group. */
  requested: number;
  /** Row ids to hand to undoQueueAction. Empty ⇒ offer no undo. */
  undoTargets: string[];
  /** Machine-readable failure code, for logs. */
  error?: string;
  /** Plain words for the reader. Only meaningful when ok is false. */
  message?: string;
};

export type UndoOutcome = {
  ok: boolean;
  restored: number;
  requested: number;
  /**
   * Mirrors the RPC's `expires_at_recoverable`. false ⇒ a false_alarm's 24h
   * silence was reversed but the expiry it overwrote had never been recorded
   * (an action taken before the 20260817020000 migration shipped). The item is
   * back in the queue; the silence window is not the one it had before.
   * Surfaced to the reader, never hidden.
   */
  expiresRecoverable: boolean;
  error?: string;
  message: string;
};

/** Distinct id per invocation so the client can tell repeat outcomes apart. */
function newRunId(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * fn_dashboard_queue_action and fn_dashboard_queue_undo report refusals by
 * RETURNING jsonb {ok:false, error}, which is a normal return — Supabase leaves
 * `error` null. Every caller must check both signals or an expired session
 * reads as a success (the bug fixed in d7dc6bd620; kept fixed here).
 */
type RpcPayload = { ok?: boolean; error?: string } & Record<string, unknown>;

/** Plain words for each refusal the RPCs can return. No codes at the reader. */
function actionMessage(code: string | null | undefined): string {
  switch (code) {
    case 'not_authenticated':
      return 'Your session has ended. Sign in again and retry.';
    case 'not_found_or_not_owned':
      return 'That item is no longer in your queue.';
    case 'invalid_action':
      return "That action isn't available for this item.";
    default:
      return "That didn't go through. Nothing was changed — try again.";
  }
}

/**
 * Migration-first sequencing, made graceful.
 *
 * fn_dashboard_queue_undo ships in migration 20260817020000 and the Director
 * applies that BEFORE this PR merges. If the order is ever reversed — code live,
 * migration not yet applied — every Undo tap on all six buttons calls a function
 * that does not exist. PostgREST answers PGRST202 ("Could not find the function
 * … in the schema cache"), which arrives as a transport error and would
 * otherwise be flattened into the generic "Couldn't undo that". That sentence
 * invites the reader to tap again forever.
 *
 * Detected here so the toast can say the specific true thing instead. Nothing is
 * retried and nothing is worked around: the forward action already landed and is
 * unaffected — fn_dashboard_queue_action exists either way, and the migration
 * only adds one metadata key to it.
 */
function isFunctionNotDeployed(
  error: { code?: string; message?: string } | null
): boolean {
  if (!error) return false;
  // PGRST202 = no matching function in the PostgREST schema cache.
  // 42883     = undefined_function, if the call reaches Postgres at all.
  if (error.code === 'PGRST202' || error.code === '42883') return true;
  const m = (error.message ?? '').toLowerCase();
  return (
    m.includes('could not find the function') ||
    m.includes('fn_dashboard_queue_undo') ||
    m.includes('does not exist')
  );
}

function undoMessage(code: string | null | undefined): string {
  switch (code) {
    case 'undo_not_deployed':
      return "Undo isn't available yet — the database update it needs has not been applied. Nothing was changed.";
    case 'undo_window_expired':
      return 'Too late to undo.';
    case 'not_an_undoable_action':
      return "This one can't be undone from here.";
    case 'acted_by_another_user':
      return 'Someone else acted on this, so it stays as it is.';
    case 'superseded':
      return 'This has changed since you acted. It was left as it is.';
    case 'not_found_or_not_owned':
      return 'That item is no longer in your queue.';
    case 'not_authenticated':
      return 'Your session has ended. Sign in again.';
    default:
      return "Couldn't undo that. Nothing was changed.";
  }
}

/** The rows one card stands for, visible row first. */
function resolveTargets(formData: FormData, userNotificationId: string): string[] {
  const groupRaw = String(formData.get('userNotificationIds') ?? '');
  const groupIds = groupRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return groupIds.length > 0
    ? [userNotificationId, ...groupIds.filter((id) => id !== userNotificationId)]
    : [userNotificationId];
}

/**
 * Perform an inline action on a queue item via fn_dashboard_queue_action RPC.
 * Returns what happened so the caller can name it and offer an undo.
 */
export async function performQueueAction(
  formData: FormData
): Promise<QueueActionOutcome> {
  const runId = newRunId();
  const userNotificationId = String(formData.get('userNotificationId') ?? '');
  const action = String(formData.get('action') ?? '') as QueueAction;
  const note = (formData.get('note') as string) || null;
  const delegateTo = (formData.get('delegateTo') as string) || null;
  const snoozeMinutesRaw = formData.get('snoozeMinutes') as string | null;
  const snoozeMinutes = snoozeMinutesRaw ? parseInt(snoozeMinutesRaw, 10) : null;
  const idempotencyKey =
    (formData.get('idempotencyKey') as string) ||
    `${userNotificationId}:${action}`;

  if (!userNotificationId || !action) {
    console.warn('[dashboard/queue-action] missing params', {
      userNotificationId,
      action
    });
    return {
      runId,
      ok: false,
      applied: 0,
      requested: 0,
      undoTargets: [],
      error: 'missing_params',
      message: actionMessage('missing_params')
    };
  }

  // 2026-08-09 — group dismissal.
  // The queue collapses repeated daily digest rows into one card, so a single
  // card can stand for N user_notification rows. fn_dashboard_queue_action
  // resolves exactly one row per call, so acting on the visible card used to
  // clear only the newest run and the next-oldest immediately took its place —
  // the card looked like it refused to go away. The optional
  // `userNotificationIds` field carries every row the card represents; we
  // apply the same action to each.
  //
  // Order matters: the visible row goes first so its outcome is what the
  // reader sees even if a later call fails. Sequential, not Promise.all — a
  // burst of concurrent writes against the same person's notification rows
  // buys nothing and risks lock contention. The list is bounded by the queue
  // page size (listQueueItems limit = 50).
  const targets = resolveTargets(formData, userNotificationId);

  try {
    const supabase = await createClient();
    let applied = 0;
    const done: string[] = [];
    let firstError: string | undefined;

    for (const target of targets) {
      // A grouped run needs a distinct key per row — reusing the visible
      // card's key would make every follow-up call look like a replay of the
      // first and be swallowed by the idempotency guard.
      const key =
        targets.length === 1 ? idempotencyKey : `${target}:${action}`;
      const { data, error } = await supabase.rpc('fn_dashboard_queue_action', {
        p_user_notification_id: target,
        p_action: action,
        p_note: note,
        p_delegate_to: delegateTo,
        p_snooze_minutes: snoozeMinutes,
        p_idempotency_key: key
      });

      const payload = data as RpcPayload | null;
      const refused = payload?.ok === false;
      if (error || refused) {
        firstError = refused ? (payload?.error ?? 'unknown') : 'transport';
        console.error('[dashboard/queue-action] action failed:', {
          target,
          action,
          transportError: error ?? null,
          rpcError: refused ? (payload?.error ?? 'unknown') : null
        });
        // First row failing is the one the reader acted on — stop and let the
        // page re-render unchanged rather than half-clearing the group.
        if (applied === 0) {
          return {
            runId,
            ok: false,
            action,
            applied: 0,
            requested: targets.length,
            undoTargets: [],
            error: firstError,
            message: actionMessage(firstError)
          };
        }
        break;
      }

      applied += 1;
      // An idempotent replay changed nothing this time round, so it is not a
      // row this undo should try to reverse — reversing it would un-do an act
      // from an earlier request that the reader is not looking at.
      if (payload?.idempotent !== true) done.push(target);
      console.log('[dashboard/queue-action] completed', {
        userNotificationId: target,
        action,
        result: data
      });
    }

    if (applied > 1) {
      console.log('[dashboard/queue-action] group applied', {
        action,
        requested: targets.length,
        applied
      });
    }

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/i/[instId]', 'page');

    return {
      runId,
      ok: true,
      action,
      applied,
      requested: targets.length,
      // Only the terminal four are reversible. snooze and Skip get no undo:
      // they are already recoverable, and an undo bar on a safe action is the
      // noise that teaches people to ignore the one that matters.
      undoTargets: UNDOABLE_ACTIONS.includes(action) ? done : []
    };
  } catch (err) {
    console.error('[dashboard/queue-action] unexpected error:', err);
    return {
      runId,
      ok: false,
      action,
      applied: 0,
      requested: targets.length,
      undoTargets: [],
      error: 'unexpected',
      message: actionMessage('unexpected')
    };
  }
}

/**
 * `<form action={…}>` requires void | Promise<void>, and performQueueAction now
 * returns an outcome. This is the adapter for callers that post a form and have
 * nothing to do with the result — today that is the Morning Brief's inline
 * Snooze, which is recoverable and deliberately silent, so there is no toast to
 * raise and no undo to offer.
 *
 * It exists because dropping the return type would take the undo bar with it,
 * and because a plain `<form action={performQueueAction}>` is a *type* error
 * that this repo's PR-scoped typecheck would not have reported: morning-brief.tsx
 * is not in this PR's diff, so the gate ignores errors in it. Found by checking
 * every importer by hand.
 */
export async function performQueueActionForm(formData: FormData): Promise<void> {
  await performQueueAction(formData);
}

/**
 * Reverse one terminal queue action inside the undo window.
 *
 * Calls fn_dashboard_queue_undo (migration 20260817020000), which restores
 * user_notifications.acknowledged_at to NULL — putting the card back in the
 * queue — clears notifications.acted_by so the same action can be taken again,
 * and restores the pre-silence expires_at for a false_alarm.
 *
 * The window is 60s server-side though the UI only offers ~8s, so a slow
 * network never turns a legitimate undo into a refusal. The RPC refuses rather
 * than corrupts on every other case; nothing here retries or works around a
 * refusal.
 */
export async function undoQueueAction(input: {
  targets: string[];
}): Promise<UndoOutcome> {
  const targets = (input?.targets ?? []).filter(Boolean);
  if (targets.length === 0) {
    return {
      ok: false,
      restored: 0,
      requested: 0,
      expiresRecoverable: true,
      error: 'missing_params',
      message: undoMessage('missing_params')
    };
  }

  try {
    const supabase = await createClient();
    let restored = 0;
    let firstError: string | undefined;
    // Starts true and is only pulled down by a row that admits it could not
    // put an overwritten expiry back — so the reader is told about the one
    // part of the reversal that is incomplete.
    let expiresRecoverable = true;

    for (const target of targets) {
      const { data, error } = await supabase.rpc('fn_dashboard_queue_undo', {
        p_user_notification_id: target
      });
      const payload = data as RpcPayload | null;
      const refused = payload?.ok === false;
      if (error || refused) {
        // The RPC is missing entirely — the same answer for every remaining
        // target, so stop rather than issue N identical failing calls.
        if (isFunctionNotDeployed(error)) {
          console.error('[dashboard/queue-undo] RPC not deployed:', {
            target,
            transportError: error
          });
          return {
            ok: false,
            restored,
            requested: targets.length,
            expiresRecoverable: true,
            error: 'undo_not_deployed',
            message: undoMessage('undo_not_deployed')
          };
        }
        firstError ??= refused ? (payload?.error ?? 'unknown') : 'transport';
        console.error('[dashboard/queue-undo] undo failed:', {
          target,
          transportError: error ?? null,
          rpcError: refused ? (payload?.error ?? 'unknown') : null
        });
        continue;
      }
      restored += 1;
      if (payload?.expires_at_recoverable === false) expiresRecoverable = false;
    }

    if (restored === 0) {
      return {
        ok: false,
        restored: 0,
        requested: targets.length,
        expiresRecoverable: true,
        error: firstError,
        message: undoMessage(firstError)
      };
    }

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/i/[instId]', 'page');

    // A partial group is reported as a partial, not rounded up to success.
    // The cause is deliberately not named: the rows that refused could have
    // been past the window, superseded, or stamped by somebody else, and this
    // loop keeps only the first code. Asserting one reason would be a claim the
    // data does not support.
    const message =
      restored < targets.length
        ? `Put back ${restored} of ${targets.length} — the rest were not reversed.`
        : !expiresRecoverable
          ? 'Back in your queue. The 24-hour silence could not be reset — check the item.'
          : targets.length > 1
            ? `Back in your queue — all ${restored} runs.`
            : 'Back in your queue.';

    return {
      ok: true,
      restored,
      requested: targets.length,
      expiresRecoverable,
      error: firstError,
      message
    };
  } catch (err) {
    console.error('[dashboard/queue-undo] unexpected error:', err);
    return {
      ok: false,
      restored: 0,
      requested: targets.length,
      expiresRecoverable: true,
      error: 'unexpected',
      message: undoMessage('unexpected')
    };
  }
}
