/**
 * Dashboard v2 — Single queue item card with inline actions
 *
 * Server component. Every inline action is ONE tap; the six final ones raise a
 * toast naming what happened with an Undo for ~8 seconds (QueueActionButton →
 * performQueueAction → fn_dashboard_queue_action, reversed by
 * fn_dashboard_queue_undo). Idempotent via idempotency_key.
 *
 * An earlier revision of this PR added a confirm dialog in front of approve /
 * reject / Close lead. The Director chose undo INSTEAD of confirm, so no
 * confirmation step is introduced here at all — including on "🔥 Broadcast
 * rescue", which stays exactly the plain one-tap form it already is on main.
 * See RescueActions for why that one gets no undo either.
 *
 * Spec: specs/myjkkn-dashboard-v2-spec.md §4.2 (4 item types + inline actions)
 */

import Link from 'next/link';
import {
  QueueItem,
  formatRelativeAge,
  queueTypeEmoji,
  queueTypeLabel
} from '@/lib/services/dashboard/decision-queue-service';
import {
  initiateRescueBroadcast,
  claimRescueBroadcast
} from '@/app/(routes)/dashboard/_actions/rescue-actions';
import { QueueActionButton } from '@/components/dashboard/queue-action-button';

// ============================================================================
// Severity-aware badge pill
// ============================================================================
function SeverityPill({ band, priority }: { band: string; priority: string | null }) {
  const className =
    band === 'red'
      ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200'
      : band === 'amber'
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
        : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300';
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide ${className}`}
    >
      {priority ?? 'normal'}
    </span>
  );
}

// ============================================================================
// Overdue/Due-soon pill — makes stale decisions visually impossible to ignore.
// Actionability upgrade #5 (2026-04-21).
// ============================================================================
type DeadlineStatus = 'overdue' | 'due_soon' | 'on_track';

function computeDeadlineStatus(item: QueueItem): DeadlineStatus {
  // Auto-escalated = system already flagged it; show OVERDUE regardless of hours.
  if (item.escalated_at) return 'overdue';
  const hrs = item.acknowledgment_deadline_hours;
  if (hrs == null || hrs <= 0) return 'on_track';
  const deadlineSec = hrs * 3600;
  if (item.age_seconds >= deadlineSec) return 'overdue';
  // Within 30 min of deadline → due_soon (1800s buffer)
  if (item.age_seconds >= deadlineSec - 1800) return 'due_soon';
  return 'on_track';
}

function DeadlinePill({ status, item }: { status: DeadlineStatus; item: QueueItem }) {
  if (status === 'on_track') return null;
  const hrs = item.acknowledgment_deadline_hours ?? 2;
  const ageH = (item.age_seconds / 3600).toFixed(1);
  if (status === 'overdue') {
    // Once the deadline is blown the limit says nothing useful ("2581.7h / 24h
    // limit" on a 107-day-old item), and the age was printed a second time in
    // the row beside this pill. State the age once, in readable units, and
    // drop the limit. The card hides its own age text while this pill shows.
    const age = formatRelativeAge(item.age_seconds);
    const label = item.escalated_at
      ? `OVERDUE · ${age} · escalated lvl ${item.escalation_level ?? 1}`
      : `OVERDUE · ${age}`;
    return (
      <span
        className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-rose-600 text-white shadow-sm animate-pulse'
        aria-label='Overdue'
        title='This item is past its acknowledgment deadline and will auto-escalate to Chief of Staff.'
      >
        ⏰ {label}
      </span>
    );
  }
  return (
    <span
      className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-amber-500 text-white'
      aria-label='Due soon'
      title='Acknowledgment deadline approaching (under 30 minutes).'
    >
      ⏳ DUE SOON · {ageH}h / {hrs}h
    </span>
  );
}

// ============================================================================
// Inline action button (submit button inside a form)
// ============================================================================
type ActionVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

type ActionButtonProps = {
  action: string;
  label: string;
  variant?: ActionVariant;
  userNotificationId: string;
  /** The card's own title — the toast names the item, not just the act. */
  itemTitle: string;
  /**
   * Past-tense name of the act, e.g. "Approved". Present ⇒ the action is final
   * and gets a named toast with an Undo for ~8 seconds. Absent ⇒ the action is
   * already recoverable (Snooze, Skip) and passes silently: an undo bar on a
   * safe action is the noise that teaches people to ignore the ones that
   * matter.
   *
   * It is a separate prop from `action` because the mapping is not 1:1 —
   * "✕ Reject" and "Close lead" both post action='reject', and "Rejected" is
   * the wrong word for the second.
   */
  doneLabel?: string;
  /**
   * Every user_notification row this button should act on. A collapsed daily
   * digest card stands for more than one row; acting on only the visible row
   * left the rest to reappear on the next render. Omit (or pass a single id)
   * for ordinary cards.
   */
  groupIds?: string[];
  extraFields?: Record<string, string>;
};

function actionButtonClass(variant: ActionVariant) {
  const cls = {
    primary:
      'bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-600',
    // The fill here used to be bg-white dark:bg-neutral-900 — byte-identical to
    // the card behind it — with only a neutral-200/700 hairline to separate the
    // two. In dark mode that hairline is nearly invisible and the button read
    // as plain text. A lighter surface in dark mode plus a stronger border on
    // both themes gives it an edge you can actually see and aim at.
    secondary:
      'bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-700 border-neutral-400 dark:border-neutral-500 shadow-sm',
    danger:
      'bg-rose-600 text-white hover:bg-rose-700 border-rose-600',
    // 'ghost' is the low-emphasis choice (Snooze, Skip, False alarm) — but it
    // still has to look like something you can tap. A transparent border made
    // it read as plain text next to a filled button and got missed on phones.
    ghost:
      'bg-neutral-50 dark:bg-neutral-800/60 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 border-neutral-200 dark:border-neutral-700'
  }[variant];

  return `min-h-[36px] px-3.5 py-2 rounded-lg border text-xs font-medium transition-all hover:shadow-sm active:scale-[0.98] ${cls}`;
}

/**
 * Every queue action is one tap. The client component behind this raises the
 * toast and, for the final ones, the Undo — see queue-action-button.tsx for why
 * that has to be a client component rather than a bare server-action form.
 */
function ActionButton({
  action,
  label,
  variant = 'secondary',
  userNotificationId,
  itemTitle,
  doneLabel,
  groupIds,
  extraFields = {}
}: ActionButtonProps) {
  return (
    <QueueActionButton
      action={action}
      label={label}
      doneLabel={doneLabel}
      itemTitle={itemTitle}
      className={actionButtonClass(variant)}
      userNotificationId={userNotificationId}
      groupIds={groupIds}
      extraFields={extraFields}
    />
  );
}

// ============================================================================
// Per-type action rows
// ============================================================================
// Every row takes groupIds so a collapsed digest clears as one unit whatever
// its queue_type happens to be.
type ActionRowProps = { item: QueueItem; groupIds?: string[] };

function ApprovalActions({ item, groupIds }: ActionRowProps) {
  // Approve and Reject sit ~10px apart on a 387px phone and both are final, so
  // the hazard is a mis-tap in either direction. Both are one tap and both get
  // an undo bar: the symmetry is the point, because one-tap Approve beside a
  // guarded Reject would make approving the cheaper act, and a queue of
  // governance decisions should not have its thumb on the scale.
  return (
    <div className='flex flex-wrap gap-2'>
      <ActionButton
        action='approve'
        label='✓ Approve'
        doneLabel='Approved'
        variant='primary'
        userNotificationId={item.user_notification_id}
        itemTitle={item.title}
        groupIds={groupIds}
      />
      <ActionButton
        action='reject'
        label='✕ Reject'
        doneLabel='Rejected'
        variant='danger'
        userNotificationId={item.user_notification_id}
        itemTitle={item.title}
        groupIds={groupIds}
      />
      <ActionButton
        action='snooze'
        label='Snooze 2h'
        variant='ghost'
        userNotificationId={item.user_notification_id}
        itemTitle={item.title}
        groupIds={groupIds}
        extraFields={{ snoozeMinutes: '120' }}
      />
    </div>
  );
}

function EscalationActions({ item, groupIds }: ActionRowProps) {
  return (
    <div className='flex flex-wrap gap-2'>
      <ActionButton
        action='acknowledge'
        label='Mark resolved'
        doneLabel='Marked resolved'
        variant='primary'
        userNotificationId={item.user_notification_id}
        itemTitle={item.title}
        groupIds={groupIds}
      />
      <ActionButton
        action='snooze'
        label='Snooze 2h'
        variant='ghost'
        userNotificationId={item.user_notification_id}
        itemTitle={item.title}
        groupIds={groupIds}
        extraFields={{ snoozeMinutes: '120' }}
      />
    </div>
  );
}

function RescueActions({ item, groupIds }: ActionRowProps) {
  const cfg = (item.action_config ?? {}) as Record<string, unknown>;
  const broadcastId =
    typeof cfg.broadcast_id === 'string' && cfg.broadcast_id.length > 0
      ? (cfg.broadcast_id as string)
      : null;
  const leadId = typeof cfg.lead_id === 'string' ? (cfg.lead_id as string) : null;

  // CASE 1 — Counselor view: this notification IS a broadcast (has broadcast_id).
  //          Show Claim button which races via SELECT FOR UPDATE.
  //
  //          Claiming is an acquire — you are taking the lead on, not deleting
  //          anything — so it wears the same affirmative emerald as Broadcast
  //          rescue below. It was crimson, the colour this file reserves for
  //          Reject, which read as a destructive act.
  //
  //          A broadcast notification carries a single broadcast_id and is
  //          never a digest, so it is never one of the collapsed cards and
  //          needs no group handling here.
  if (broadcastId) {
    return (
      <div className='flex flex-wrap gap-2'>
        <form action={claimRescueBroadcast} className='inline-block'>
          <input type='hidden' name='broadcastId' value={broadcastId} />
          <input
            type='hidden'
            name='userNotificationId'
            value={item.user_notification_id}
          />
          {/* No confirmation and no undo here on purpose: claiming is an
              acquire, it is raced against other counsellors via SELECT FOR
              UPDATE, and it assigns the lead to you in admission_leads — none
              of which fn_dashboard_queue_undo reverses. Offering an Undo that
              only un-acknowledged the notification would be a lie. */}
          <button type='submit' className={actionButtonClass('primary')}>
            🔥 Claim rescue
          </button>
        </form>
        <ActionButton
          action='snooze'
          label='Skip'
          variant='ghost'
          userNotificationId={item.user_notification_id}
          itemTitle={item.title}
          groupIds={groupIds}
          extraFields={{ snoozeMinutes: '120' }}
        />
      </div>
    );
  }

  // CASE 2 — Director/Manager view: this is an invitation to broadcast (has lead_id).
  //          Submit fires initiateRescueBroadcast.
  //
  //          A daily digest card summarises many leads and carries no single
  //          lead_id, so broadcasting is not on offer — show no button rather
  //          than printing an internal column name at the reader. A non-digest
  //          rescue with no lead_id is a real data fault: log it for ops.
  if (!leadId && cfg.digest !== true) {
    console.warn(
      '[dashboard/queue] rescue item has no lead_id — broadcast button hidden',
      {
        userNotificationId: item.user_notification_id,
        notificationId: item.notification_id
      }
    );
  }

  return (
    <div className='flex flex-wrap gap-2'>
      {leadId ? (
        // ONE TAP. No confirm dialog and no undo bar — deliberately, and they
        // are two different reasons:
        //
        //   no confirm — the Director's decision for this queue was undo
        //     INSTEAD of confirm. Adding a dialog to this one button would ship
        //     the shape that was rejected. main has no dialog here today; this
        //     is unchanged from main.
        //
        //   no undo — initiateRescueBroadcast IS terminal (it posts
        //     action='approve' through fn_dashboard_queue_action, so it does
        //     set acknowledged_at), but its terminal half is the trivial half.
        //     Before that it calls fn_rescue_broadcast_initiate, which fans an
        //     alert out to the counselling team. fn_dashboard_queue_undo cannot
        //     recall a sent alert, and it explicitly REFUSES this row
        //     (idempotency key '…:broadcast:initiated'). An Undo button that
        //     only put the card back would tell the reader the alert had been
        //     withdrawn when it had not.
        <form action={initiateRescueBroadcast} className='inline-block'>
          <input type='hidden' name='leadId' value={leadId} />
          <input
            type='hidden'
            name='userNotificationId'
            value={item.user_notification_id}
          />
          <input type='hidden' name='scope' value='{}' />
          <button type='submit' className={actionButtonClass('primary')}>
            🔥 Broadcast rescue
          </button>
        </form>
      ) : null}
      {/* Closing a lead is routine housekeeping, not a destructive operation.
          A filled crimson button overstated it next to a text-only Snooze.
          It is final, so it carries an undo — but it is not "Rejected". */}
      <ActionButton
        action='reject'
        label='Close lead'
        doneLabel='Lead closed'
        variant='secondary'
        userNotificationId={item.user_notification_id}
        itemTitle={item.title}
        groupIds={groupIds}
      />
      <ActionButton
        action='snooze'
        label='Snooze 2h'
        variant='ghost'
        userNotificationId={item.user_notification_id}
        itemTitle={item.title}
        groupIds={groupIds}
        extraFields={{ snoozeMinutes: '120' }}
      />
    </div>
  );
}

function AnomalyActions({ item, groupIds }: ActionRowProps) {
  return (
    <div className='flex flex-wrap gap-2'>
      <ActionButton
        action='acknowledge'
        label='Acknowledge'
        doneLabel='Acknowledged'
        variant='primary'
        userNotificationId={item.user_notification_id}
        itemTitle={item.title}
        groupIds={groupIds}
      />
      <ActionButton
        action='false_alarm'
        label='False alarm (silence 24h)'
        doneLabel='Silenced for 24 hours'
        variant='ghost'
        userNotificationId={item.user_notification_id}
        itemTitle={item.title}
        groupIds={groupIds}
      />
    </div>
  );
}

// ============================================================================
// Card
// ============================================================================
export function QueueItemCard({
  item,
  repeats = 1,
  groupIds
}: {
  item: QueueItem;
  /** How many unacknowledged runs of this daily digest this card stands for. */
  repeats?: number;
  /**
   * The user_notification rows behind those runs. Handed to the action buttons
   * so one tap clears the whole group instead of the newest run only.
   */
  groupIds?: string[];
}) {
  const ageText = formatRelativeAge(item.age_seconds);
  const typeLabel = queueTypeLabel(item.queue_type);
  const emoji = queueTypeEmoji(item.queue_type);
  const deadlineStatus = computeDeadlineStatus(item);

  // Card click target: prefer action_config.url (the underlying work-item or
  // a category-filtered notifications view) so a click jumps Director straight
  // to the actionable destination. Fallback: /notifications/admin/<id> meta
  // page when no action URL is set. Same pattern as PR #512's notification-card
  // fix; applied here so the dashboard Decision Queue cards are also clickable.
  const cfg = item.action_config as { url?: string } | null | undefined;
  const _actionConfigUrl =
    typeof cfg?.url === 'string' && cfg.url.trim() ? cfg.url.trim() : null;
  const _cardHref = _actionConfigUrl ?? `/notifications/admin/${item.notification_id}`;
  const _cardIsExternal = /^https?:\/\//i.test(_cardHref);

  // Overdue items get an extra-strong border to pop visually in a long queue.
  const borderClass =
    deadlineStatus === 'overdue'
      ? 'border-l-rose-600 dark:border-l-rose-500 ring-1 ring-rose-200 dark:ring-rose-900'
      : item.severity_band === 'red'
        ? 'border-l-rose-500 dark:border-l-rose-400'
        : item.severity_band === 'amber'
          ? 'border-l-amber-500 dark:border-l-amber-400'
          : 'border-l-neutral-300 dark:border-l-neutral-700';

  return (
    <article
      className={`border border-neutral-200 dark:border-neutral-800 border-l-4 ${borderClass} rounded-xl p-4 bg-white dark:bg-neutral-900 hover:shadow-md transition-shadow animate-in slide-in-from-bottom-2 duration-300`}
    >
      {/* Title + body wrapped in Link → action_config.url. Action buttons
          stay outside the link (they're forms with their own submit handlers). */}
      <Link
        href={_cardHref}
        target={_cardIsExternal ? '_blank' : undefined}
        rel={_cardIsExternal ? 'noopener noreferrer' : undefined}
        aria-label={`Open ${item.title}${_actionConfigUrl ? '' : ' (notification details)'}`}
        className='block rounded-md -m-1 p-1 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset transition-colors'
      >
        <div className='flex items-start justify-between gap-3'>
          <div className='flex-1 min-w-0'>
            <div className='flex items-center gap-2 flex-wrap'>
              <span className='text-base leading-none'>{emoji}</span>
              <span className='text-xs font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wide'>
                {typeLabel}
              </span>
              <SeverityPill band={item.severity_band} priority={item.priority} />
              <DeadlinePill status={deadlineStatus} item={item} />
              {/* The overdue pill already states the age — printing it again
                  here said the same thing twice on a 387px-wide screen. */}
              {deadlineStatus !== 'overdue' && (
                <span className='tabular-nums font-mono text-[11px] text-neutral-500'>· {ageText}</span>
              )}
              {repeats > 1 && (
                <span className='inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'>
                  {repeats} daily runs
                </span>
              )}
            </div>
            <h3 className='mt-1.5 text-sm font-semibold text-neutral-900 dark:text-neutral-100 leading-snug group-hover:underline'>
              {item.title}
            </h3>
            <p className='mt-1 text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed line-clamp-3'>
              {item.body}
            </p>
            {/* This used to be a title attribute on the pill above. title only
                appears on hover, and the audit that found this ran on a touch
                device where there is no hover — so the explanation for why one
                card now stands for several was unreachable. Plain visible text
                instead. */}
            {repeats > 1 && (
              <p className='mt-1.5 text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed'>
                Raised once a day · {repeats} runs still open, newest shown ·
                acting here clears all {repeats}
              </p>
            )}
          </div>
        </div>
      </Link>

      <div className='mt-3 pt-3 border-t border-neutral-100 dark:border-neutral-800'>
        {item.queue_type === 'approval' && (
          <ApprovalActions item={item} groupIds={groupIds} />
        )}
        {item.queue_type === 'escalation' && (
          <EscalationActions item={item} groupIds={groupIds} />
        )}
        {item.queue_type === 'rescue' && (
          <RescueActions item={item} groupIds={groupIds} />
        )}
        {item.queue_type === 'anomaly' && (
          <AnomalyActions item={item} groupIds={groupIds} />
        )}
      </div>
    </article>
  );
}
