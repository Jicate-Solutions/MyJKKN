/**
 * Dashboard v2 — Single queue item card with inline actions
 *
 * Server component. Inline actions dispatch Next.js Server Actions
 * via <form action={performQueueAction}> (idempotent via idempotency_key).
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
    const label = item.escalated_at
      ? `OVERDUE · escalated lvl ${item.escalation_level ?? 1}`
      : `OVERDUE · ${ageH}h / ${hrs}h limit`;
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
        className={`min-h-[36px] px-3.5 py-2 rounded-lg border text-xs font-medium transition-all hover:shadow-sm active:scale-[0.98] ${cls}`}
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
  const cfg = (item.action_config ?? {}) as Record<string, unknown>;
  const broadcastId =
    typeof cfg.broadcast_id === 'string' && cfg.broadcast_id.length > 0
      ? (cfg.broadcast_id as string)
      : null;
  const leadId = typeof cfg.lead_id === 'string' ? (cfg.lead_id as string) : null;

  // CASE 1 — Counselor view: this notification IS a broadcast (has broadcast_id).
  //          Show Claim button which races via SELECT FOR UPDATE.
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
          <button
            type='submit'
            className='min-h-[36px] px-3.5 py-2 rounded-lg border text-xs font-medium transition-all bg-rose-600 text-white hover:bg-rose-700 hover:shadow-sm active:scale-[0.98] border-rose-600'
          >
            🔥 Claim rescue
          </button>
        </form>
        <ActionButton
          action='snooze'
          label='Skip'
          variant='ghost'
          userNotificationId={item.user_notification_id}
          extraFields={{ snoozeMinutes: '120' }}
        />
      </div>
    );
  }

  // CASE 2 — Director/Manager view: this is an invitation to broadcast (has lead_id).
  //          Submit fires initiateRescueBroadcast.
  return (
    <div className='flex flex-wrap gap-2'>
      {leadId ? (
        <form action={initiateRescueBroadcast} className='inline-block'>
          <input type='hidden' name='leadId' value={leadId} />
          <input
            type='hidden'
            name='userNotificationId'
            value={item.user_notification_id}
          />
          <input type='hidden' name='scope' value='{}' />
          <button
            type='submit'
            className='min-h-[36px] px-3.5 py-2 rounded-lg border text-xs font-medium transition-all bg-emerald-600 text-white hover:bg-emerald-700 hover:shadow-sm active:scale-[0.98] border-emerald-600'
          >
            🔥 Broadcast rescue
          </button>
        </form>
      ) : (
        <span className='text-[11px] text-neutral-500 px-2 py-1'>
          (lead_id missing — cannot broadcast)
        </span>
      )}
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
  const deadlineStatus = computeDeadlineStatus(item);

  // Card click target: prefer action_config.url (the underlying work-item or
  // a category-filtered notifications view) so a click jumps Director straight
  // to the actionable destination. Fallback: /admin/notifications/<id> meta
  // page when no action URL is set. Same pattern as PR #512's notification-card
  // fix; applied here so the dashboard Decision Queue cards are also clickable.
  const cfg = item.action_config as { url?: string } | null | undefined;
  const _actionConfigUrl =
    typeof cfg?.url === 'string' && cfg.url.trim() ? cfg.url.trim() : null;
  const _cardHref = _actionConfigUrl ?? `/admin/notifications/${item.notification_id}`;
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
              <span className='tabular-nums font-mono text-[11px] text-neutral-500'>· {ageText}</span>
            </div>
            <h3 className='mt-1.5 text-sm font-semibold text-neutral-900 dark:text-neutral-100 leading-snug group-hover:underline'>
              {item.title}
            </h3>
            <p className='mt-1 text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed line-clamp-3'>
              {item.body}
            </p>
          </div>
        </div>
      </Link>

      <div className='mt-3 pt-3 border-t border-neutral-100 dark:border-neutral-800'>
        {item.queue_type === 'approval' && <ApprovalActions item={item} />}
        {item.queue_type === 'escalation' && <EscalationActions item={item} />}
        {item.queue_type === 'rescue' && <RescueActions item={item} />}
        {item.queue_type === 'anomaly' && <AnomalyActions item={item} />}
      </div>
    </article>
  );
}
