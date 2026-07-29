// lib/services/notification/notification-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

const supabase = createClientSupabaseClient();
import type {
  Notification,
  NotificationFilters,
  CreateNotificationDto,
  UpdateNotificationDto,
  BulkUpdateNotificationDto,
  NotificationStats,
  NotificationPreference,
  CreateNotificationPreferenceDto,
  UpdateNotificationPreferenceDto,
  SendNotificationDto
} from '@/types/notification';
import {
  NotificationChannel,
  NotificationType,
  NotificationCategory,
  NotificationPriority,
  NotificationStatus
} from '@/types/notification';

// ==================== NOTIFICATION EXPIRY ====================

/**
 * PostgREST `.or()` predicate that EXCLUDES expired notifications from a
 * user-facing read: keep rows whose parent `notifications` row has no expiry,
 * or an expiry still in the future.
 *
 * Applied on the embedded `notification` join (that alias is set in each select
 * below) via `{ foreignTable: 'notification' }`, exactly like the existing
 * title/body search filter. The `!inner` join makes it exclusionary — a
 * user_notifications row whose notification has lapsed drops out entirely, so
 * the bell badge, the inbox list, and the rollup counts all agree on which rows
 * are still live.
 *
 * Before 2026-07-26 nothing in the read path honored expires_at, so
 * self-obsoleting cron nudges (dashboard:scf_nudge, doctrines:friday-reflection,
 * doctrines:sunday-wrap) accumulated unread forever (~170K rows). Computed per
 * call so `now` is fresh; milliseconds are stripped to keep the value
 * unambiguous in PostgREST's comma/period-delimited filter grammar.
 *
 * Scope: user-facing reads only (counts, list, rollups). Admin/manage/stats
 * paths intentionally do NOT apply this — admins must still audit lapsed rows.
 */
export function liveNotificationOrFilter(): string {
  const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  return `expires_at.is.null,expires_at.gt.${nowIso}`;
}

// ==================== NOTIFICATION CRUD ====================

/** Global (NOT page-scoped) tallies for a user's notification inbox. */
export interface NotificationCounts {
  /** Unread across the WHOLE inbox, independent of page/limit. */
  unread: number;
  /** Total across the whole inbox. */
  total: number;
  /** Global count per RAW stored category value, e.g. { Alert: 85, general: 12 }. */
  byCategory: Record<string, number>;
}

/**
 * Count a user's notifications GLOBALLY.
 *
 * Why this exists: callers used to derive counts with
 * `notifications.filter(n => !n.is_read).length` over an already-paginated
 * result. With the UI's limit=20 that could never exceed 20, so a 258-unread
 * inbox reported "18 unread" — an array length standing in for a COUNT query.
 *
 * These queries deliberately mirror getNotifications()' `!inner` join to
 * `notifications`: without it a user_notifications row whose notification is
 * missing would be counted here but dropped from the list, so the badge and
 * the list would disagree. `head: true` means no rows travel — Postgres
 * returns the count only.
 *
 * Pass the route's cookie-scoped client so this runs as `authenticated`
 * (RLS on user_notifications invokes fn_notification_is_for_user, which `anon`
 * lacks EXECUTE on) — same contract as getNotifications().
 */
export async function getNotificationCounts(
  userId: string,
  client?: SupabaseClient
): Promise<NotificationCounts> {
  const db = client ?? supabase;

  const base = () =>
    db
      .from('user_notifications')
      .select(
        'notification:notifications!user_notifications_notification_id_fkey!inner(category)',
        { count: 'exact', head: true }
      )
      .eq('user_id', userId)
      // Exclude lapsed notifications so the badge counts only live rows.
      .or(liveNotificationOrFilter(), { foreignTable: 'notification' });

  // Unread === read_at IS NULL. There is no archive concept on
  // user_notifications (no is_archived / archived_at column exists), so this
  // is the whole of "unread".
  const [totalRes, unreadRes] = await Promise.all([
    base(),
    base().is('read_at', null)
  ]);

  if (totalRes.error) throw totalRes.error;
  if (unreadRes.error) throw unreadRes.error;

  // Per-category tallies. PostgREST has no GROUP BY, so pull just the single
  // category column (head:false, no range) and tally in memory. One narrow
  // column for the caller's own rows — not the fully-joined payload the list
  // query returns.
  const { data: catRows, error: catError } = await db
    .from('user_notifications')
    .select(
      'notification:notifications!user_notifications_notification_id_fkey!inner(category)'
    )
    .eq('user_id', userId)
    // Same expiry filter as the badge counts so per-category tallies agree.
    .or(liveNotificationOrFilter(), { foreignTable: 'notification' });

  if (catError) throw catError;

  const byCategory: Record<string, number> = {};
  for (const row of (catRows || []) as any[]) {
    // Supabase types an embedded to-one join as an array; it is an object at
    // runtime. Handle both rather than trusting either.
    const embedded = Array.isArray(row.notification)
      ? row.notification[0]
      : row.notification;
    const category = embedded?.category;
    if (!category) continue;
    byCategory[category] = (byCategory[category] || 0) + 1;
  }

  return {
    unread: unreadRes.count ?? 0,
    total: totalRes.count ?? 0,
    byCategory
  };
}

/**
 * Events whose rows collapse into ONE rollup row in the inbox, mapped to the
 * metadata key naming the distinct real-world entity behind each row.
 *
 * Deliberately a flat lookup of what actually exists in production, not a
 * plugin surface. Today exactly one event rolls up: the Instagram silence
 * cron emits one row per silent department per alert day, so the entity is the
 * department's IG account (metadata.ig_user_id).
 *
 * Events absent from this map are NOT rollups and are never aggregated — as of
 * 2026-07-15 that is 170 of the director's 311 rows, which carry no
 * metadata.event at all, plus ig_ownership_flipped (a genuine one-off).
 */
const EVENT_ENTITY_KEYS: Record<string, string> = {
  ig_silence_alert: 'ig_user_id',
  // The runner-down alert is ONE incident re-fired hourly during an outage,
  // not N distinct entities. Its entity is the alert HOUR (metadata.alert_hour,
  // written by ai-tasks-sweep), so distinct_entities == "number of times we
  // alerted" — the inbox renders that as "alerted N times", never "N runners".
  ai_runner_down: 'alert_hour'
};

/** Rows read per page while tallying one event. Kept well under PostgREST's
 *  max-rows ceiling, which TRUNCATES SILENTLY rather than erroring. */
const ROLLUP_PAGE_SIZE = 1000;

/** Hard stop on the paging loop. 20k rows for ONE event for ONE user is orders
 *  of magnitude beyond any real cadence (35 departments x weekly re-alert is
 *  ~1.8k/year); hitting it means something is wrong, so we drop the rollup
 *  rather than report a half-scanned number. */
const ROLLUP_MAX_PAGES = 20;

/** A group of notification rows that the inbox renders as ONE row. */
export interface NotificationEventRollup {
  /** metadata.event value, e.g. 'ig_silence_alert'. */
  event: string;
  /** GLOBAL row count for this event across the whole inbox — NOT page-scoped. */
  rows: number;
  /** GLOBAL count of DISTINCT entities behind those rows. This is the number
   *  the rollup label must show. */
  distinct_entities: number;
  /** metadata key the distinct count was taken on, e.g. 'ig_user_id'. */
  entity_key: string;
}

/**
 * Tally per-event rollups for a user's inbox GLOBALLY.
 *
 * Why this exists: the inbox must say "35 departments are silent". 35 is
 * COUNT(DISTINCT metadata.ig_user_id) across 140 rows — but the client loads 20
 * rows per page, so it CANNOT know the number is 35. Counting the loaded rows
 * yields "20 departments" on page 1 and "140 departments" once fully scrolled;
 * both are wrong, and both have shipped. The number is only correct if the
 * server computes it, exactly as unread_count is (see getNotificationCounts).
 *
 * PostgREST has no GROUP BY and no COUNT(DISTINCT), so the distinct tally has
 * to happen in memory. Two traps that make a naive tally lie:
 *
 *  1. A bare .limit()/.select() is capped by PostgREST's max-rows and truncates
 *     SILENTLY — the tally is simply wrong with no error. So we page with
 *     explicit .range() and only trust the result once a SHORT page proves we
 *     reached the end.
 *  2. .range() without an ORDER BY is not stable across queries — Postgres may
 *     return rows in any order, so pages could skip rows and undercount. We
 *     order by user_notifications.id, which is unique.
 *
 * `rows` and `distinct_entities` come from the SAME scan, so they cannot
 * disagree even though the IG crons are inserting live.
 *
 * Mirrors getNotificationCounts()/getNotifications()' `!inner` join so the
 * rollup and the list agree on which rows exist, and takes the caller's
 * cookie-scoped client so RLS runs as `authenticated` — a service-role client
 * would bypass RLS and tally OTHER users' inboxes into this user's count.
 */
export async function getNotificationEventRollups(
  userId: string,
  client?: SupabaseClient
): Promise<NotificationEventRollup[]> {
  const db = client ?? supabase;
  const rollups: NotificationEventRollup[] = [];

  for (const [event, entityKey] of Object.entries(EVENT_ENTITY_KEYS)) {
    const entities = new Set<string>();
    let rows = 0;
    let complete = false;

    for (let page = 0; page < ROLLUP_MAX_PAGES; page++) {
      const start = page * ROLLUP_PAGE_SIZE;
      const { data, error } = await db
        .from('user_notifications')
        .select(
          'id, notification:notifications!user_notifications_notification_id_fkey!inner(metadata)'
        )
        .eq('user_id', userId)
        .eq('notification.metadata->>event', event)
        // Exclude lapsed rows so a rollup's distinct-entity count matches the
        // live inbox list (same expiry filter as getNotifications).
        .or(liveNotificationOrFilter(), { foreignTable: 'notification' })
        .order('id', { ascending: true })
        .range(start, start + ROLLUP_PAGE_SIZE - 1);

      if (error) throw error;

      const batch = (data || []) as any[];
      rows += batch.length;

      for (const row of batch) {
        // Supabase types an embedded to-one join as an array; it is an object
        // at runtime. Handle both rather than trusting either.
        const embedded = Array.isArray(row.notification)
          ? row.notification[0]
          : row.notification;
        const value = embedded?.metadata?.[entityKey];
        // jsonb round-trips ids as string or number depending on the writer.
        if (value !== null && value !== undefined && value !== '') {
          entities.add(String(value));
        }
      }

      if (batch.length < ROLLUP_PAGE_SIZE) {
        complete = true;
        break;
      }
    }

    if (!complete) {
      // We never proved we read every row, so any number here would be a guess.
      // Omitting the rollup makes the inbox fall back to rendering the rows
      // themselves — visibly noisy, but never a wrong count.
      console.error(
        `[notifications] rollup for "${event}" exceeded ${
          ROLLUP_MAX_PAGES * ROLLUP_PAGE_SIZE
        } rows for user ${userId}; omitting rather than reporting a truncated count`
      );
      continue;
    }

    if (rows === 0) continue;

    rollups.push({
      event,
      rows,
      distinct_entities: entities.size,
      entity_key: entityKey
    });
  }

  return rollups;
}

/**
 * getNotifications' filters, plus `event`.
 *
 * Declared here rather than widening NotificationFilters in types/notification.ts
 * because `event` is a filter this service implements against a jsonb key, not
 * part of the shared Notification DTO vocabulary. NotificationFilters remains
 * assignable to this, so every existing caller is unaffected.
 */
export type NotificationListFilters = NotificationFilters & {
  /** Exact match on notifications.metadata->>'event'. Lets the inbox fetch one
   *  rollup's rows on expand without loading the whole inbox. Omitted =>
   *  behaviour is identical to before this filter existed. */
  event?: string;
};

export async function getNotifications(
  filters: NotificationListFilters = {},
  client?: SupabaseClient
): Promise<Notification[]> {
  // When called from a Next.js API route, the route passes its cookie-scoped
  // server client so the query runs as `authenticated` (RLS policies invoke
  // fn_notification_is_for_user, which `anon` lacks EXECUTE on).
  // When called from a browser-side React Query hook, the module-level singleton
  // is correct because the browser attaches the user's session cookie.
  const db = client ?? supabase;

  let query = db
    .from('user_notifications')
    .select(
      `
      *,
      notification:notifications!user_notifications_notification_id_fkey!inner(
        id,
        title,
        body,
        url,
        action_config,
        icon,
        category,
        priority,
        metadata,
        created_at
      ),
      user:profiles!user_notifications_user_id_fkey(id, full_name, email)
    `
    )
    .order('created_at', { ascending: false });

  if (filters.user_id) {
    query = query.eq('user_id', filters.user_id);
  }

  if (filters.is_read !== undefined) {
    if (filters.is_read) {
      query = query.not('read_at', 'is', null);
    } else {
      query = query.is('read_at', null);
    }
  }

  if (filters.from_date) {
    query = query.gte('created_at', filters.from_date);
  }

  if (filters.to_date) {
    query = query.lte('created_at', filters.to_date);
  }

  // Filters on the embedded notifications table (the join).
  // The `!inner` annotation in the select string makes these exclusionary —
  // user_notifications without a matching notification row are dropped.
  // Bug found 2026-05-04: the route accepted these params but the service
  // ignored them, so /notifications tabs (Announcements, Reminders, Events,
  // Alerts, General) ran client-side filters that produced 0 matches against
  // dashboard:* category data, then triggered an infinite loadMore() loop.
  if (filters.category) {
    // Case-insensitive: stored categories are inconsistently cased ('general'
    // lowercase, 'Alert' capitalised) and some are namespaced
    // ('dashboard:hr_brief'). An eq() compare meant the UI's 'General' tab
    // never matched the stored 'general' and rendered empty forever.
    // ilike without wildcards is an exact match, case-insensitively; escape
    // any %/_ in the caller's value so they stay literal.
    query = query.ilike(
      'notification.category',
      filters.category.replace(/[%_]/g, '\\$&')
    );
  }

  if (filters.priority) {
    query = query.eq('notification.priority', filters.priority);
  }

  // Fetch exactly one rollup's rows (e.g. the 140 ig_silence_alert rows) so
  // expanding a rollup doesn't require paging the entire inbox. Exact match on
  // the jsonb key — unlike category, metadata.event values are machine-written
  // by the crons and consistently cased, so no ilike is warranted here.
  if (filters.event) {
    query = query.eq('notification.metadata->>event', filters.event);
  }

  // Drop lapsed notifications from the user-facing inbox list so it agrees with
  // the badge count (see liveNotificationOrFilter). AND-combines with any search
  // .or() below. Admin/manage paths do NOT call getNotifications(), so their
  // audit view still shows expired rows.
  query = query.or(liveNotificationOrFilter(), { foreignTable: 'notification' });

  if (filters.search) {
    // Search title or body. Embedded-table search uses foreignTable option.
    const term = filters.search.replace(/[%_]/g, '\\$&');
    query = query.or(
      `title.ilike.%${term}%,body.ilike.%${term}%`,
      { foreignTable: 'notification' }
    );
  }

  // Use range() for pagination — it handles both offset and limit in one call.
  // Using both .limit() and .range() causes PostgREST to apply limit first,
  // then range on the limited set, which can cut off newer notifications.
  if (filters.offset !== undefined || filters.limit !== undefined) {
    const start = filters.offset || 0;
    const end = start + (filters.limit || 20) - 1;
    query = query.range(start, end);
  }

  const { data, error } = await query;

  if (error) throw error;

  // Map the nested Supabase result to the flat Notification interface
  // DB returns: { user_id, notification_id, read_at, notification: { title, body, ... } }
  // UI expects: { title, message, is_read, is_archived, ... }
  return (
    (data || []).map((row: any) => {
      const n = row.notification || {};
      return {
        id: row.id,
        user_id: row.user_id,
        notification_id: row.notification_id,
        title: n.title || '',
        message: n.body || '',
        type: n.metadata?.type || 'info',
        category: n.category || 'system',
        priority: n.priority || 'normal',
        status: row.read_at ? 'read' : 'unread',
        is_read: !!row.read_at,
        is_archived: false,
        read_at: row.read_at,
        // Dashboard work-item digests (cron-generated) write the destination
        // URL into action_config.url, NOT notifications.url. Read both so
        // every notification with any kind of routing target reaches the UI.
        // Bug found 2026-05-04: dashboard:* digests had url=null on every
        // row; clicks marked-as-read but never navigated.
        action_url: n.url || n.action_config?.url || undefined,
        metadata: n.metadata,
        channels: ['in_app'],
        created_at: row.created_at,
        updated_at: row.created_at,
        user: row.user
      } as Notification;
    }) || []
  );
}

export async function getNotification(
  id: string
): Promise<Notification | null> {
  const { data, error } = await supabase
    .from('user_notifications')
    .select(
      `
      *,
      notification:notifications!user_notifications_notification_id_fkey!inner(
        id,
        title,
        body,
        url,
        action_config,
        icon,
        category,
        priority,
        metadata,
        created_at
      ),
      user:profiles!user_notifications_user_id_fkey(id, full_name, email)
    `
    )
    .eq('id', id)
    .single();

  if (error) throw error;
  if (!data) return null;

  const row = data as any;
  const n = row.notification || {};
  return {
    id: row.id,
    user_id: row.user_id,
    notification_id: row.notification_id,
    title: n.title || '',
    message: n.body || '',
    type: n.metadata?.type || 'info',
    category: n.category || 'system',
    priority: n.priority || 'normal',
    status: row.read_at ? 'read' : 'unread',
    is_read: !!row.read_at,
    is_archived: false,
    read_at: row.read_at,
    // Same fallback as getNotifications — read URL from action_config when
    // notifications.url is null (cron-generated dashboard digests).
    action_url: n.url || n.action_config?.url || undefined,
    metadata: n.metadata,
    channels: ['in_app'],
    created_at: row.created_at,
    updated_at: row.created_at,
    user: row.user
  } as Notification;
}

export async function createNotification(
  dto: CreateNotificationDto,
  actorId?: string,
  client?: SupabaseClient
): Promise<Notification> {
  // Server callers MUST pass their session-bound client. The module-level
  // `supabase` here is the BROWSER singleton: imported into a route handler it
  // carries no session, so every query runs as `anon` — the notifications RLS
  // then rejects the write (INSERT needs is_super_admin()/is_admin(auth.uid()))
  // and the trailing .select() calls fn_notification_is_for_user, which anon
  // may not EXECUTE ("permission denied for function"). Same pattern as the
  // other client-accepting helpers in this file.
  const db = client ?? supabase;
  // Map the legacy DTO onto the REAL public.notifications columns. The table
  // has NO message/type/user_id/channels/status/is_read/is_archived columns —
  // those belong to the per-recipient user_notifications table or to metadata.
  // Writing them here throws at runtime (silently dropped when a caller wraps
  // this in try/catch). See feedback_ai_rpc_send_notification_broken.
  const channels = dto.channels || [NotificationChannel.IN_APP];
  // created_by is NOT NULL with no default. Prefer the acting/authenticated
  // user threaded from the caller; else fall back to the recipient id. Never
  // null or a zero uuid.
  const createdBy = actorId ?? dto.user_id;

  const { data, error } = await db
    .from('notifications')
    .insert({
      title: dto.title,
      body: dto.message,
      category: dto.category,
      priority: dto.priority || NotificationPriority.NORMAL,
      created_by: createdBy,
      targeting: { type: 'user', user_ids: [dto.user_id] },
      ...(dto.action_url ? { url: dto.action_url } : {}),
      metadata: {
        ...(dto.metadata ?? {}),
        type: dto.type,
        ...(dto.action_label ? { action_label: dto.action_label } : {})
      }
    } as any)
    .select()
    .single();

  if (error) throw error;

  // Re-attach the legacy UI-shaped fields the DB row does not carry, so the
  // returned object stays compatible with callers and with sendToChannels().
  const notification = {
    ...(data as any),
    user_id: dto.user_id,
    message: dto.message,
    type: dto.type,
    action_url: dto.action_url,
    action_label: dto.action_label,
    channels
  } as unknown as Notification;

  // Mirror into user_notifications so getNotifications() (which queries that
  // junction table) can surface this notification in the bell/inbox UI.
  if (dto.user_id) {
    const { error: ujError } = await (db as any)
      .from('user_notifications')
      .insert({ user_id: dto.user_id, notification_id: notification.id });
    if (ujError) console.error('user_notifications insert failed:', ujError);
  }

  // TODO: Send to external channels (email, SMS, push) based on channels array
  await sendToChannels(notification);

  return notification;
}

export async function updateNotification(
  id: string,
  dto: UpdateNotificationDto
): Promise<Notification> {
  const updateData: any = { ...dto };

  if (dto.is_read === true && !updateData.read_at) {
    updateData.read_at = new Date().toISOString();
  }

  if (dto.is_archived === true && !updateData.archived_at) {
    updateData.archived_at = new Date().toISOString();
  }

  const { data, error } = await (supabase
    .from('notifications') as any)
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteNotification(id: string): Promise<void> {
  const { error } = await (supabase as any).from('notifications').delete().eq('id', id);

  if (error) throw error;
}

// ==================== BULK OPERATIONS ====================

export async function bulkUpdateNotifications(
  dto: BulkUpdateNotificationDto
): Promise<void> {
  const updateData: any = {};

  if (dto.status) updateData.status = dto.status;
  if (dto.is_read !== undefined) {
    updateData.is_read = dto.is_read;
    if (dto.is_read === true) {
      updateData.read_at = new Date().toISOString();
    }
  }
  if (dto.is_archived !== undefined) {
    updateData.is_archived = dto.is_archived;
    if (dto.is_archived === true) {
      updateData.archived_at = new Date().toISOString();
    }
  }

  const { error } = await (supabase
    .from('notifications') as any)
    .update(updateData)
    .in('id', dto.notification_ids);

  if (error) throw error;
}

export async function markAsRead(notificationId: string): Promise<void> {
  const { error } = await (supabase
    .from('user_notifications') as any)
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId);

  if (error) throw error;
}

export async function markAllAsRead(userId: string): Promise<void> {
  const { error } = await (supabase
    .from('user_notifications') as any)
    .update({
      read_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .is('read_at', null);

  if (error) throw error;
}

export async function archiveNotification(
  notificationId: string
): Promise<void> {
  await updateNotification(notificationId, {
    is_archived: true,
    status: NotificationStatus.ARCHIVED
  });
}

export async function deleteAllRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from('user_notifications')
    .delete()
    .eq('user_id', userId)
    .not('read_at', 'is', null);

  if (error) throw error;
}

// ==================== STATISTICS ====================

export async function getNotificationStats(
  userId: string
): Promise<NotificationStats> {
  const { data: userNotifications, error } = await supabase
    .from('user_notifications')
    .select('read_at, notification:notifications!user_notifications_notification_id_fkey(category, priority)')
    .eq('user_id', userId);

  if (error) throw error;

  const stats: NotificationStats = {
    total_notifications: userNotifications?.length || 0,
    unread_count:
      userNotifications?.filter((n: any) => !n.read_at).length || 0,
    read_count: userNotifications?.filter((n: any) => n.read_at).length || 0,
    archived_count: 0,
    by_category: [],
    by_type: [],
    by_priority: []
  };

  // Group by category
  const categoryMap = new Map<string, number>();
  userNotifications?.forEach((n: any) => {
    if (n.notification?.category) {
      categoryMap.set(n.notification.category, (categoryMap.get(n.notification.category) || 0) + 1);
    }
  });
  stats.by_category = Array.from(categoryMap.entries()).map(
    ([category, count]) => ({
      category: category as NotificationCategory,
      count
    })
  );

  // Group by priority
  const priorityMap = new Map<string, number>();
  userNotifications?.forEach((n: any) => {
    if (n.notification?.priority) {
      priorityMap.set(n.notification.priority, (priorityMap.get(n.notification.priority) || 0) + 1);
    }
  });
  stats.by_priority = Array.from(priorityMap.entries()).map(
    ([priority, count]) => ({
      priority: priority as NotificationPriority,
      count
    })
  );

  return stats;
}

// ==================== PREFERENCES ====================

export async function getUserPreferences(
  userId: string
): Promise<NotificationPreference[]> {
  const { data, error } = await (supabase
    .from('notification_preferences' as any) as any)
    .select('*')
    .eq('user_id', userId);

  if (error) throw error;
  return (data as unknown as NotificationPreference[]) || [];
}

export async function createPreference(
  dto: CreateNotificationPreferenceDto
): Promise<NotificationPreference> {
  const { data, error } = await (supabase
    .from('notification_preferences' as any) as any)
    .insert({
      ...dto,
      enabled: dto.enabled !== undefined ? dto.enabled : true
    })
    .select()
    .single();

  if (error) throw error;
  return data as unknown as NotificationPreference;
}

export async function updatePreference(
  id: string,
  dto: UpdateNotificationPreferenceDto
): Promise<NotificationPreference> {
  const { data, error } = await (supabase
    .from('notification_preferences' as any) as any)
    .update(dto)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as NotificationPreference;
}

export async function deletePreference(id: string): Promise<void> {
  const { error } = await (supabase
    .from('notification_preferences' as any) as any)
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ==================== SEND NOTIFICATIONS ====================

export async function sendNotification(
  dto: SendNotificationDto
): Promise<Notification[]> {
  const notifications: Notification[] = [];

  for (const userId of dto.user_ids) {
    // Check user preferences
    const preferences = await getUserPreferences(userId);
    const categoryPref = preferences.find((p) => p.category === dto.category);

    // Skip if disabled
    if (categoryPref && !categoryPref.enabled) continue;

    // Check quiet hours
    if (categoryPref && isInQuietHours(categoryPref)) continue;

    // Determine channels
    const channels = dto.channels ||
      categoryPref?.channels || [NotificationChannel.IN_APP];

    // Render template if provided
    let title = dto.title;
    let message = dto.message;

    if (dto.template_name && dto.variables) {
      const rendered = await renderTemplate(
        dto.template_name,
        dto.variables,
        dto
      );
      title = rendered.title;
      message = rendered.message;
    }

    // Create notification
    const notification = await createNotification({
      user_id: userId,
      type: dto.type,
      category: dto.category,
      priority: dto.priority || NotificationPriority.NORMAL,
      title,
      message,
      metadata: dto.metadata,
      action_url: dto.action_url,
      action_label: dto.action_label,
      channels
    });

    notifications.push(notification);
  }

  return notifications;
}

// ==================== HELPER FUNCTIONS ====================

async function sendToChannels(notification: Notification): Promise<void> {
  // TODO: Implement actual channel sending
  for (const channel of notification.channels) {
    switch (channel) {
      case NotificationChannel.EMAIL:
        // await sendEmail(notification);
        console.log('Email notification sent:', notification.id);
        break;
      case NotificationChannel.SMS:
        // await sendSMS(notification);
        console.log('SMS notification sent:', notification.id);
        break;
      case NotificationChannel.PUSH:
        // await sendPush(notification);
        console.log('Push notification sent:', notification.id);
        break;
      case NotificationChannel.IN_APP:
        // Already stored in database
        break;
    }
  }
}

function isInQuietHours(preference: NotificationPreference): boolean {
  if (!preference.quiet_hours_start || !preference.quiet_hours_end) {
    return false;
  }

  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes();

  const [startHour, startMin] = preference.quiet_hours_start
    .split(':')
    .map(Number);
  const [endHour, endMin] = preference.quiet_hours_end.split(':').map(Number);

  const quietStart = startHour * 60 + startMin;
  const quietEnd = endHour * 60 + endMin;

  if (quietStart < quietEnd) {
    return currentTime >= quietStart && currentTime <= quietEnd;
  } else {
    // Crosses midnight
    return currentTime >= quietStart || currentTime <= quietEnd;
  }
}

async function renderTemplate(
  templateName: string,
  variables: Record<string, string>,
  dto: SendNotificationDto
): Promise<{ title: string; message: string }> {
  // TODO: Fetch template from database and render with variables
  // For now, just use the provided title/message
  let title = dto.title;
  let message = dto.message;

  // Simple variable replacement
  Object.entries(variables).forEach(([key, value]) => {
    title = title.replace(new RegExp(`{{${key}}}`, 'g'), value);
    message = message.replace(new RegExp(`{{${key}}}`, 'g'), value);
  });

  return { title, message };
}

// ==================== ADMIN/MANAGE NOTIFICATIONS ====================

export async function getNotificationsManage(params: {
  page: number;
  limit: number;
  search: string;
  sort_by: string;
  sort_order: string;
}): Promise<{
  success: boolean;
  data: import('@/types/notification').NotificationWithStats[];
  pagination: {
    page: number;
    limit: number;
    total_pages: number;
    total_items: number;
  };
}> {
  const searchParams = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    search: params.search || '',
    sort_by: params.sort_by || 'created_at',
    sort_order: params.sort_order || 'desc'
  });

  const response = await fetch(
    `/api/notifications/manage?${searchParams.toString()}`
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to fetch notifications');
  }

  return response.json();
}

// ==================== PRE-BUILT NOTIFICATION CREATORS ====================

export async function notifyReservationApproved(
  userId: string,
  resourceName: string,
  reservationId: string
): Promise<Notification> {
  return await createNotification({
    user_id: userId,
    type: NotificationType.SUCCESS,
    category: NotificationCategory.RESERVATION,
    priority: NotificationPriority.NORMAL,
    title: 'Reservation Approved',
    message: `Your reservation for "${resourceName}" has been approved!`,
    metadata: {
      reservation_id: reservationId,
      resource_name: resourceName
    },
    action_url: `/resource-management/reservations/${reservationId}`,
    action_label: 'View Details',
    channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL]
  });
}

export async function notifyReservationRejected(
  userId: string,
  resourceName: string,
  reservationId: string,
  reason?: string
): Promise<Notification> {
  return await createNotification({
    user_id: userId,
    type: NotificationType.ERROR,
    category: NotificationCategory.RESERVATION,
    priority: NotificationPriority.HIGH,
    title: 'Reservation Rejected',
    message: `Your reservation for "${resourceName}" has been rejected. ${
      reason ? `Reason: ${reason}` : ''
    }`,
    metadata: {
      reservation_id: reservationId,
      resource_name: resourceName
    },
    action_url: `/resource-management/reservations/${reservationId}`,
    action_label: 'View Details',
    channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL]
  });
}

export async function notifyMaintenanceScheduled(
  userId: string,
  resourceName: string,
  scheduledDate: string,
  maintenanceId: string
): Promise<Notification> {
  return await createNotification({
    user_id: userId,
    type: NotificationType.INFO,
    category: NotificationCategory.MAINTENANCE,
    priority: NotificationPriority.NORMAL,
    title: 'Maintenance Scheduled',
    message: `Maintenance for "${resourceName}" is scheduled for ${new Date(
      scheduledDate
    ).toLocaleDateString()}.`,
    metadata: {
      maintenance_id: maintenanceId,
      resource_name: resourceName
    },
    action_url: `/resource-management/maintenance/${maintenanceId}`,
    action_label: 'View Details',
    channels: [NotificationChannel.IN_APP]
  });
}

export async function notifyMaintenanceReminder(
  userId: string,
  resourceName: string,
  scheduledDate: string,
  maintenanceId: string
): Promise<Notification> {
  return await createNotification({
    user_id: userId,
    type: NotificationType.REMINDER,
    category: NotificationCategory.MAINTENANCE,
    priority: NotificationPriority.HIGH,
    title: 'Maintenance Reminder',
    message: `Reminder: Maintenance for "${resourceName}" is due on ${new Date(
      scheduledDate
    ).toLocaleDateString()}.`,
    metadata: {
      maintenance_id: maintenanceId,
      resource_name: resourceName
    },
    action_url: `/resource-management/maintenance/${maintenanceId}`,
    action_label: 'View Details',
    channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL]
  });
}

export async function notifyApprovalPending(
  userId: string,
  resourceName: string,
  requesterName: string,
  reservationId: string
): Promise<Notification> {
  return await createNotification({
    user_id: userId,
    type: NotificationType.WARNING,
    category: NotificationCategory.APPROVAL,
    priority: NotificationPriority.HIGH,
    title: 'Approval Required',
    message: `${requesterName} has requested to reserve "${resourceName}". Your approval is required.`,
    metadata: {
      reservation_id: reservationId,
      resource_name: resourceName
    },
    action_url: `/resource-management/reservations/approvals`,
    action_label: 'Review Request',
    channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL]
  });
}
