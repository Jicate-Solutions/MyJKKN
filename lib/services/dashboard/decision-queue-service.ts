/**
 * Dashboard v2 — Decision Queue service (server fetch + types + formatters)
 *
 * Server-side fetch via fn_dashboard_queue_list RPC.
 * Mutations (approve/reject/etc) live in app/(routes)/dashboard/_actions/queue-actions.ts
 * to keep 'use server' scoped and avoid leaking utilities as Server Actions.
 *
 * Spec: specs/myjkkn-dashboard-v2-spec.md §7.2
 */

import { createClient } from '@/lib/supabase/server';

// ============================================================================
// Types
// ============================================================================
export type QueueType = 'approval' | 'escalation' | 'rescue' | 'anomaly';
export type QueueFilter = 'all' | QueueType;
export type SeverityBand = 'red' | 'amber' | 'neutral';

export type QueueItem = {
  user_notification_id: string;
  notification_id: string;
  title: string;
  body: string;
  category: string;
  priority: 'urgent' | 'high' | 'normal' | null;
  action_type: string | null;
  action_config: Record<string, unknown> | null;
  created_at: string;
  acknowledgment_deadline_hours: number | null;
  escalated_at: string | null;
  escalation_level: number | null;
  age_seconds: number;
  severity_order: number;
  severity_band: SeverityBand;
  queue_type: QueueType | 'other';
};

export type QueueCounts = {
  total: number;
  approval: number;
  escalation: number;
  rescue: number;
  anomaly: number;
};

export type QueueListResult = {
  items: QueueItem[];
  counts: QueueCounts;
  fetched_at: string;
};

const EMPTY_RESULT: QueueListResult = {
  items: [],
  counts: { total: 0, approval: 0, escalation: 0, rescue: 0, anomaly: 0 },
  fetched_at: new Date().toISOString()
};

// ============================================================================
// Server fetch
// ============================================================================
export async function listQueueItems(
  filter: QueueFilter = 'all',
  limit = 50
): Promise<QueueListResult> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('fn_dashboard_queue_list', {
      p_filter: filter,
      p_limit: limit
    });

    if (error) {
      console.error('[dashboard/queue] list error:', error);
      return EMPTY_RESULT;
    }

    return (data as QueueListResult) ?? EMPTY_RESULT;
  } catch (err) {
    console.error('[dashboard/queue] unexpected list error:', err);
    return EMPTY_RESULT;
  }
}

// ============================================================================
// Pure utilities (safe to import anywhere — no 'use server')
// ============================================================================
export function formatRelativeAge(ageSeconds: number): string {
  if (ageSeconds < 60) return 'just now';
  const m = Math.floor(ageSeconds / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  const rem = m - h * 60;
  if (h < 24) return rem === 0 ? `${h}h ago` : `${h}h ${rem}m ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function queueTypeLabel(t: QueueType | 'other'): string {
  switch (t) {
    case 'approval':
      return 'Approval';
    case 'escalation':
      return 'Escalation';
    case 'rescue':
      return 'Rescue';
    case 'anomaly':
      return 'Anomaly';
    default:
      return 'Other';
  }
}

export function queueTypeEmoji(t: QueueType | 'other'): string {
  switch (t) {
    case 'approval':
      return '✅';
    case 'escalation':
      return '⚠️';
    case 'rescue':
      return '🔥';
    case 'anomaly':
      return '📡';
    default:
      return '•';
  }
}
