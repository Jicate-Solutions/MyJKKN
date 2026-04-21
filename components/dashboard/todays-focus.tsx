/**
 * Dashboard v2 — "Today's Focus" card
 *
 * The single most-important action derived from current dashboard metrics.
 * Rendered ABOVE the hero strip so the director's eye lands on the one thing
 * that matters right now — rather than scanning 4 tiles to figure out which
 * is the problem.
 *
 * Heuristic (spec: dashboard actionability #2, 2026-04-21):
 *  1. Find the lowest-scoring OHS component (attendance, sla, fees, escalations)
 *  2. If it's < 70, surface THAT as the focus with a deep-link to fix it
 *  3. If all components ≥ 70 but OHS < 80, surface the composite
 *  4. If OHS ≥ 80, surface pipeline/attendance anomalies if any
 *  5. If everything is green, render a "you're clear" encouragement
 *
 * Server component — reads metrics directly. Duplicates the RPC call from
 * hero-strip's fetch, which is acceptable: same query, ~20ms, React cache
 * can dedupe if we wire it later. Isolation matters more than micro-perf.
 */

import Link from 'next/link';
import type { DashboardMetrics } from '@/lib/services/dashboard/dashboard-metrics-service';
import type { QueueItem, QueueCounts } from '@/lib/services/dashboard/decision-queue-service';

export type FocusPayload = {
  tone: 'red' | 'amber' | 'green';
  icon: string;
  headline: string;
  context: string;
  action?: {
    label: string;
    href: string;
  };
};

// ============================================================================
// Queue-driven focus (preferred path, 2026-04-21)
//
// When the work-item generators have populated the queue, prefer a REAL item
// over the aggregate heuristic. This is the "nobel-laureate actionability"
// change: the card names a specific person, amount, or section — not a
// percentage. Shows the highest-severity item + queue-type counts.
// ============================================================================
export function deriveTodaysFocusFromQueue(
  topItem: QueueItem,
  counts: QueueCounts
): FocusPayload {
  const cfg = (topItem.action_config ?? {}) as Record<string, unknown>;
  const url = typeof cfg.url === 'string' ? cfg.url : `/dashboard?queue=${topItem.queue_type}`;
  const tone: FocusPayload['tone'] =
    topItem.severity_band === 'red' ? 'red' : topItem.severity_band === 'amber' ? 'amber' : 'amber';

  const icon =
    topItem.queue_type === 'escalation'
      ? '⚠️'
      : topItem.queue_type === 'rescue'
        ? '🔥'
        : topItem.queue_type === 'approval'
          ? '✅'
          : '📡';

  // Build a context line describing the spread of pending items so the
  // director understands this is ONE of N things, not the only thing.
  const countLine = [
    counts.escalation > 0 ? `${counts.escalation} escalation${counts.escalation === 1 ? '' : 's'}` : null,
    counts.rescue > 0 ? `${counts.rescue} rescue${counts.rescue === 1 ? '' : 's'}` : null,
    counts.approval > 0 ? `${counts.approval} approval${counts.approval === 1 ? '' : 's'}` : null,
    counts.anomaly > 0 ? `${counts.anomaly} anomal${counts.anomaly === 1 ? 'y' : 'ies'}` : null
  ]
    .filter(Boolean)
    .join(' · ');

  const context = [
    topItem.body || 'Open the item for details.',
    countLine ? `Queue: ${countLine}.` : null
  ]
    .filter(Boolean)
    .join(' ');

  return {
    tone,
    icon,
    headline: topItem.title,
    context,
    action: {
      label: 'Open now →',
      href: url
    }
  };
}

// ============================================================================
// Heuristic: pick the single thing to focus on
// ============================================================================
export function deriveTodaysFocus(metrics: DashboardMetrics): FocusPayload {
  const components = metrics.ohs.components;
  const ohsScore = metrics.ohs.score;
  const ohsBand = metrics.ohs.band;

  // Sort components by score ascending to find the weakest link
  const entries = (
    [
      ['attendance', components.attendance, '/academic/attendance/dashboard', '📋', 'Attendance'],
      ['sla', components.sla, '/admission/leads?filter=sla_breach', '⚡', 'SLA breach'],
      ['fees', components.fees, '/billing/receipts?status=overdue', '💰', 'Fee collection'],
      ['escalations', components.escalations, '/dashboard?queue=escalation', '⚠️', 'Escalations']
    ] as const
  )
    .map(([key, score, href, icon, label]) => ({ key, score, href, icon, label }))
    .sort((a, b) => a.score - b.score);

  const weakest = entries[0];

  // Rule 1: a component is in red zone (<50) — fix it first
  if (weakest.score < 50) {
    return {
      tone: 'red',
      icon: weakest.icon,
      headline: `${weakest.label} at ${weakest.score}% — focus here`,
      context: focusContextFor(weakest.key, metrics),
      action: {
        label: `Open ${weakest.label.toLowerCase()}`,
        href: weakest.href
      }
    };
  }

  // Rule 2: a component is in amber zone (<70) — surface it
  if (weakest.score < 70) {
    return {
      tone: 'amber',
      icon: weakest.icon,
      headline: `${weakest.label} dragging OHS down (${weakest.score}%)`,
      context: focusContextFor(weakest.key, metrics),
      action: {
        label: `Review ${weakest.label.toLowerCase()}`,
        href: weakest.href
      }
    };
  }

  // Rule 3: all components ≥70 but composite OHS still under 80 — report composite
  if (ohsScore < 80) {
    return {
      tone: 'amber',
      icon: '📊',
      headline: `OHS at ${ohsScore} — components are healthy but composite trails`,
      context: `All 4 components are above 70%, so there is no single weak link. Keep an eye on trends — a cascade could pull you below 70.`,
      action: {
        label: 'Open decision queue',
        href: '/dashboard#decision-queue'
      }
    };
  }

  // Rule 4: pending decisions above threshold even in green zone
  if (metrics.pending_decisions.count > 10) {
    return {
      tone: 'amber',
      icon: '📬',
      headline: `${metrics.pending_decisions.count} pending decisions stacking up`,
      context:
        'OHS is green but approvals, escalations, rescues, and anomalies are piling up. Clear the queue before it drags metrics.',
      action: { label: 'Open decision queue', href: '/dashboard#decision-queue' }
    };
  }

  // Rule 5: everything green — encourage
  return {
    tone: 'green',
    icon: '✨',
    headline: ohsBand === 'green' ? `OHS ${ohsScore} — all systems green` : `OHS ${ohsScore}`,
    context:
      'No single metric needs your attention right now. Use this window for strategic work — cluster calls, 1:1s, or the bigger questions this operational dashboard cannot answer.'
  };
}

function focusContextFor(
  key: 'attendance' | 'sla' | 'fees' | 'escalations',
  metrics: DashboardMetrics
): string {
  switch (key) {
    case 'attendance': {
      const pct = metrics.attendance.pct_today;
      const present = metrics.attendance.present;
      const total = metrics.attendance.total;
      if (pct === null) return 'Attendance has not been marked today for any section.';
      return `Today: ${present}/${total} present (${pct.toFixed(1)}%) across marked classes. Unmarked sections skew this number down — check which faculty haven't marked yet.`;
    }
    case 'sla': {
      return `First-touch SLA is below target. Leads aged over the SLA window — open the filtered view to triage in one pass.`;
    }
    case 'fees': {
      return `Today's collection is below the daily plan. Overdue accounts compounding — open the overdue filter to work the list top-down.`;
    }
    case 'escalations': {
      return `Open escalations are elevated. Each one represents an item a counselor couldn't resolve — review and either reassign or close.`;
    }
  }
}

// ============================================================================
// Card — tone-based styling
// ============================================================================
const TONE_STYLES: Record<
  FocusPayload['tone'],
  { border: string; bg: string; text: string; badge: string }
> = {
  red: {
    border: 'border-rose-300 dark:border-rose-700',
    bg: 'bg-gradient-to-br from-rose-50/90 via-rose-100/50 to-rose-50/70 dark:from-rose-950/50 dark:via-rose-900/30 dark:to-rose-950/50',
    text: 'text-rose-950 dark:text-rose-50',
    badge: 'bg-rose-600 text-white'
  },
  amber: {
    border: 'border-amber-300 dark:border-amber-700',
    bg: 'bg-gradient-to-br from-amber-50/90 via-amber-100/50 to-amber-50/70 dark:from-amber-950/50 dark:via-amber-900/30 dark:to-amber-950/50',
    text: 'text-amber-950 dark:text-amber-50',
    badge: 'bg-amber-600 text-white'
  },
  green: {
    border: 'border-emerald-300 dark:border-emerald-700',
    bg: 'bg-gradient-to-br from-emerald-50/90 via-emerald-100/50 to-emerald-50/70 dark:from-emerald-950/50 dark:via-emerald-900/30 dark:to-emerald-950/50',
    text: 'text-emerald-950 dark:text-emerald-50',
    badge: 'bg-emerald-600 text-white'
  }
};

export function TodaysFocusCard({ focus }: { focus: FocusPayload }) {
  const styles = TONE_STYLES[focus.tone];
  return (
    <section
      className={`rounded-2xl border-2 ${styles.border} ${styles.bg} backdrop-blur-sm p-5 sm:p-6 shadow-sm`}
      aria-label="Today's focus"
    >
      <div className='flex items-start gap-4'>
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl ${styles.badge} text-2xl shrink-0 shadow-sm`}
          aria-hidden='true'
        >
          {focus.icon}
        </div>
        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-2 mb-1.5'>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${styles.badge}`}
            >
              Today&rsquo;s Focus
            </span>
          </div>
          <h2 className={`text-lg sm:text-xl font-bold leading-tight ${styles.text}`}>
            {focus.headline}
          </h2>
          <p
            className={`mt-2 text-sm leading-relaxed ${styles.text} opacity-90 max-w-prose`}
          >
            {focus.context}
          </p>
          {focus.action && (
            <Link
              href={focus.action.href}
              className={`inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-lg text-xs font-semibold ${styles.badge} hover:opacity-90 active:scale-[0.98] transition-all shadow-sm`}
            >
              {focus.action.label}
              <span aria-hidden='true'>→</span>
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
