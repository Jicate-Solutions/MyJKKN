/**
 * Dashboard v2 — Single queue item card with inline actions
 *
 * Server component. Inline actions dispatch Next.js Server Actions
 * via <form action={performQueueAction}> (idempotent via idempotency_key).
 *
 * Spec: specs/myjkkn-dashboard-v2-spec.md §4.2 (4 item types + inline actions)
 */

import {
  QueueItem,
  formatRelativeAge,
  queueTypeEmoji,
  queueTypeLabel
} from '@/lib/services/dashboard/decision-queue-service';
import { performQueueAction } from '@/app/(routes)/dashboard/_actions/queue-actions';
import {
  initiateRescueBroadcast,
  claimRescueBroadcast
} from '@/app/(routes)/dashboard/_actions/rescue-actions';

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
// Inline action button (submit button inside a form)
// ============================================================================
type ActionButtonProps = {
  action: string;
  label: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  userNotificationId: string;
  extraFields?: Record<string, string>;
};

function ActionButton({
  action,
  label,
  variant = 'secondary',
  userNotificationId,
  extraFields = {}
}: ActionButtonProps) {
  const cls = {
    primary:
      'bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-600',
    secondary:
      'bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 border-neutral-200 dark:border-neutral-700',
    danger:
      'bg-rose-600 text-white hover:bg-rose-700 border-rose-600',
    ghost:
      'bg-transparent text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 border-transparent'
  }[variant];

  return (
    <form action={performQueueAction} className='inline-block'>
      <input type='hidden' name='userNotificationId' value={userNotificationId} />
      <input type='hidden' name='action' value={action} />
      <input
        type='hidden'
        name='idempotencyKey'
        value={`${userNotificationId}:${action}`}
      />
      {Object.entries(extraFields).map(([k, v]) => (
        <input key={k} type='hidden' name={k} value={v} />
      ))}
      <button
        type='submit'
        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${cls}`}
      >
        {label}
      </button>
    </form>
  );
}

// ============================================================================
// Per-type action rows
// ============================================================================
function ApprovalActions({ item }: { item: QueueItem }) {
  return (
    <div className='flex flex-wrap gap-2'>
      <ActionButton
        action='approve'
        label='✓ Approve'
        variant='primary'
        userNotificationId={item.user_notification_id}
      />
      <ActionButton
        action='reject'
        label='✕ Reject'
        variant='danger'
        userNotificationId={item.user_notification_id}
      />
      <ActionButton
        action='snooze'
        label='Snooze 2h'
        variant='ghost'
        userNotificationId={item.user_notification_id}
        extraFields={{ snoozeMinutes: '120' }}
      />
    </div>
  );
}

function EscalationActions({ item }: { item: QueueItem }) {
  return (
    <div className='flex flex-wrap gap-2'>
      <ActionButton
        action='acknowledge'
        label='Mark resolved'
        variant='primary'
        userNotificationId={item.user_notification_id}
      />
      <ActionButton
        action='snooze'
        label='Snooze 2h'
        variant='ghost'
        userNotificationId={item.user_notification_id}
        extraFields={{ snoozeMinutes: '120' }}
      />
    </div>
  );
}

function RescueActions({ item }: { item: QueueItem }) {
  return (
    <div className='flex flex-wrap gap-2'>
      <ActionButton
        action='approve'
        label='🔥 Broadcast rescue'
        variant='primary'
        userNotificationId={item.user_notification_id}
      />
      <ActionButton
        action='reject'
        label='Close lead'
        variant='danger'
        userNotificationId={item.user_notification_id}
      />
      <ActionButton
        action='snooze'
        label='Snooze 2h'
        variant='ghost'
        userNotificationId={item.user_notification_id}
        extraFields={{ snoozeMinutes: '120' }}
      />
    </div>
  );
}

function AnomalyActions({ item }: { item: QueueItem }) {
  return (
    <div className='flex flex-wrap gap-2'>
      <ActionButton
        action='acknowledge'
        label='Acknowledge'
        variant='primary'
        userNotificationId={item.user_notification_id}
      />
      <ActionButton
        action='false_alarm'
        label='False alarm (silence 24h)'
        variant='ghost'
        userNotificationId={item.user_notification_id}
      />
    </div>
  );
}

// ============================================================================
// Card
// ============================================================================
export function QueueItemCard({ item }: { item: QueueItem }) {
  const ageText = formatRelativeAge(item.age_seconds);
  const typeLabel = queueTypeLabel(item.queue_type);
  const emoji = queueTypeEmoji(item.queue_type);

  const borderClass =
    item.severity_band === 'red'
      ? 'border-l-rose-500 dark:border-l-rose-400'
      : item.severity_band === 'amber'
        ? 'border-l-amber-500 dark:border-l-amber-400'
        : 'border-l-neutral-300 dark:border-l-neutral-700';

  return (
    <article
      className={`border border-neutral-200 dark:border-neutral-800 border-l-4 ${borderClass} rounded-xl p-4 bg-white dark:bg-neutral-900 hover:shadow-md transition-shadow`}
    >
      <div className='flex items-start justify-between gap-3'>
        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-2 flex-wrap'>
            <span className='text-base leading-none'>{emoji}</span>
            <span className='text-xs font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wide'>
              {typeLabel}
            </span>
            <SeverityPill band={item.severity_band} priority={item.priority} />
            <span className='text-[11px] text-neutral-500'>· {ageText}</span>
          </div>
          <h3 className='mt-1.5 text-sm font-semibold text-neutral-900 dark:text-neutral-100 leading-snug'>
            {item.title}
          </h3>
          <p className='mt-1 text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed line-clamp-3'>
            {item.body}
          </p>
        </div>
      </div>

      <div className='mt-3 pt-3 border-t border-neutral-100 dark:border-neutral-800'>
        {item.queue_type === 'approval' && <ApprovalActions item={item} />}
        {item.queue_type === 'escalation' && <EscalationActions item={item} />}
        {item.queue_type === 'rescue' && <RescueActions item={item} />}
        {item.queue_type === 'anomaly' && <AnomalyActions item={item} />}
      </div>
    </article>
  );
}
