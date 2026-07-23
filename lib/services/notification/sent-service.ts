// lib/services/notification/sent-service.ts
//
// Lists notifications the current user authored (the "Sent folder").
//
// Why: today there is no surface that shows a sender what they broadcast.
// /notifications/admin is admin-scoped (all-of-platform). The bell + page
// inbox surfaces only what the user RECEIVED. If a director broadcasts to
// 4,617 principals, the only way to verify the dispatch is a Supabase query.
//
// This service closes that audit gap. The page route at /notifications/sent
// consumes the result and renders the outbox.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface SentNotificationRow {
  id: string;
  title: string;
  body: string | null;
  category: string | null;
  priority: 'low' | 'normal' | 'high' | 'urgent' | null;
  kind: string | null;
  /** ISO timestamp */
  created_at: string;
  /** Total user_notifications rows linked to this notification */
  recipient_count: number;
  /** Of recipient_count, how many have read_at set */
  read_count: number;
  /** Targeting payload (raw jsonb) — useful for "Open recipients" drill-down */
  targeting: Record<string, unknown> | null;
}

export interface SentListResult {
  rows: SentNotificationRow[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

/**
 * Fetch notifications authored by `userId`, paginated.
 *
 * Uses the cookie-scoped Supabase client passed in (caller authenticates).
 * Excludes cron-generated digests by default (kind != 'work_item') because
 * those aren't "things you sent" — they're things the system sent under
 * your UUID via SECURITY DEFINER functions. Toggle via `includeSystem`.
 */
export async function getSentNotifications(
  supabase: SupabaseClient,
  userId: string,
  opts: {
    page?: number;
    limit?: number;
    includeSystem?: boolean;
    search?: string;
  } = {}
): Promise<SentListResult> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 25));
  const offset = (page - 1) * limit;

  let query = supabase
    .from('notifications')
    .select(
      'id, title, body, category, priority, kind, created_at, targeting',
      { count: 'exact' }
    )
    .eq('created_by', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (!opts.includeSystem) {
    // Exclude cron-generated work_items so the outbox shows only
    // user-authored broadcasts. work_item rows have created_by set
    // by SECURITY DEFINER functions and would pollute the outbox.
    query = query.neq('kind', 'work_item');
  }

  if (opts.search) {
    const term = opts.search.replace(/[%_]/g, '\\$&');
    query = query.or(`title.ilike.%${term}%,body.ilike.%${term}%`);
  }

  const { data, count, error } = await query;
  if (error) throw error;

  const rows = data ?? [];

  // Per-row recipient + read counts. One COUNT per notification id; could be
  // optimized via a single RPC call later. For now: small N (typical outbox
  // page = 25 rows × 2 counts = 50 small queries). Acceptable.
  const enriched: SentNotificationRow[] = await Promise.all(
    rows.map(async (r: any) => {
      const [{ count: total }, { count: read }] = await Promise.all([
        supabase
          .from('user_notifications')
          .select('id', { count: 'exact', head: true })
          .eq('notification_id', r.id),
        supabase
          .from('user_notifications')
          .select('id', { count: 'exact', head: true })
          .eq('notification_id', r.id)
          .not('read_at', 'is', null)
      ]);
      return {
        id: r.id,
        title: r.title || '',
        body: r.body,
        category: r.category,
        priority: r.priority,
        kind: r.kind,
        created_at: r.created_at,
        recipient_count: total ?? 0,
        read_count: read ?? 0,
        targeting: r.targeting ?? null
      };
    })
  );

  const total = count ?? enriched.length;
  return {
    rows: enriched,
    total,
    page,
    limit,
    has_more: offset + enriched.length < total
  };
}
