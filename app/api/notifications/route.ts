export const dynamic = 'force-dynamic';

// app/api/notifications/route.ts

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getNotifications,
  createNotification,
  bulkUpdateNotifications,
  markAllAsRead,
  deleteAllRead
} from '@/lib/services/notification/notification-service';
import { createNotificationSchema } from '@/types/notification';

// The `notification:notifications!..._fkey!inner(...)` embed repeated in the
// count queries below MUST mirror the join in
// notification-service.getNotifications(). The `!inner` makes the join
// exclusionary (user_notifications rows whose parent notification is missing are
// dropped from the list), so counts without it would count rows the list can
// never show. The select strings are written out literally rather than built
// from a shared constant because Supabase's typed client only parses select
// strings that are literal types.

/** PostgREST caps a single response; page the category sweep to stay honest. */
const CATEGORY_PAGE_SIZE = 1000;

/**
 * Count rows for `userId` with `{ count: 'exact', head: true }` — a real
 * COUNT(*) executed by Postgres under the caller's RLS. `head: true` means no
 * rows travel over the wire, so this stays O(1) payload no matter how large the
 * inbox is.
 *
 * This exists because the previous implementation derived unread_count from
 * `notifications.filter((n) => !n.is_read).length` — an array length over the
 * CURRENT PAGE. The hook requests limit=20, so the reported unread could never
 * exceed 20. Measured on production 2026-07-15: the UI showed "18 unread" while
 * the real figure was 258 unread of 302. A page length is not a count.
 */
async function countNotifications(
  db: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  opts: { unreadOnly?: boolean } = {}
): Promise<number> {
  let query = db
    .from('user_notifications')
    .select(
      'id, notification:notifications!user_notifications_notification_id_fkey!inner(id)',
      { count: 'exact', head: true }
    )
    .eq('user_id', userId);

  // Unread is defined by `read_at IS NULL` and nothing else. user_notifications
  // has no is_archived/archived_at column, so there is no archive filter to
  // apply here (hooks/notification/use-notifications.ts passes
  // `is_archived: false`, which is a phantom param for a column that does not
  // exist and is silently ignored downstream).
  if (opts.unreadOnly) {
    query = query.is('read_at', null);
  }

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/**
 * Global count per RAW category value, e.g.
 *   { "Alert": 85, "general": 12, "dashboard:hr_brief": 3 }
 *
 * Categories are returned exactly as stored — production holds a lowercase
 * ('general'), a capitalised ('Alert') and a namespaced ('dashboard:hr_brief')
 * value side by side, so normalising the keys here would destroy information the
 * caller needs to address a tab.
 *
 * These counts are deliberately GLOBAL for the caller (unaffected by ?category
 * or ?search): consumers use them to decide which tabs are empty, and a tab must
 * be dimmed on the truth of the whole inbox, not on whichever ~20 rows happen to
 * be loaded.
 *
 * Postgres has no GROUP BY over PostgREST, so this sweeps the category column
 * only (one small string per row) in pages, bounded by the exact total already
 * counted. It never relies on a single unpaginated fetch silently fitting under
 * PostgREST's max-rows ceiling.
 */
async function getCategoryCounts(
  db: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  totalCount: number
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  if (totalCount === 0) return counts;

  for (let offset = 0; offset < totalCount; offset += CATEGORY_PAGE_SIZE) {
    const { data, error } = await db
      .from('user_notifications')
      .select(
        'id, notification:notifications!user_notifications_notification_id_fkey!inner(category)'
      )
      .eq('user_id', userId)
      // Order by the primary key, not created_at. range() without a stable,
      // unique sort lets Postgres return rows in any order between pages, which
      // would silently skip and double-count rows across the sweep. created_at
      // is not unique here and would tie.
      .order('id', { ascending: true })
      .range(offset, offset + CATEGORY_PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data as any[]) {
      const category = row.notification?.category;
      if (!category) continue;
      counts[category] = (counts[category] || 0) + 1;
    }

    if (data.length < CATEGORY_PAGE_SIZE) break;
  }

  return counts;
}

/**
 * Resolve a caller-supplied ?category to the exact value stored in the DB.
 *
 * The contract is case-insensitive matching, but the shared service filters with
 * `.eq('notification.category', ...)`. Rather than reach outside this route to
 * change a service with other callers, we translate here: the global category
 * map already lists every raw value this user can see, so we match against it
 * case-insensitively and hand the service the exact stored spelling. `?category=alert`
 * therefore resolves to 'Alert' and matches.
 *
 * An unrecognised value is passed through untouched, which correctly yields an
 * empty result rather than silently ignoring the filter.
 */
function resolveCategory(
  requested: string,
  categoryCounts: Record<string, number>
): string {
  const known = Object.keys(categoryCounts);
  const exact = known.find((c) => c === requested);
  if (exact) return exact;

  const insensitive = known.find(
    (c) => c.toLowerCase() === requested.toLowerCase()
  );
  return insensitive ?? requested;
}

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;

    // Pagination: support both `?offset=` (explicit) and `?page=` (1-indexed)
    // contracts. hooks/use-notifications.ts sends `?page=N&limit=20` for
    // infinite scroll; without `page` translation, every loadMore() call
    // returned the SAME first 20 rows, so users never reached older items.
    // Bug found 2026-05-11 (BUG-003936): Director's month-old Announcements
    // existed in the DB but were unreachable because pagination was broken.
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');
    const pageParam = searchParams.get('page');
    const limit = limitParam ? parseInt(limitParam) : undefined;
    let offset: number | undefined = offsetParam
      ? parseInt(offsetParam)
      : undefined;
    if (offset === undefined && pageParam) {
      const page = Math.max(1, parseInt(pageParam) || 1);
      offset = (page - 1) * (limit ?? 20);
    }

    // Global, caller-scoped truth. These run as the SAME cookie-scoped
    // `authenticated` client as the list query below, so RLS decides visibility
    // exactly as it does today — no service-role client, no widening.
    const [totalCount, unreadCount] = await Promise.all([
      countNotifications(supabase, user.id),
      countNotifications(supabase, user.id, { unreadOnly: true })
    ]);
    const categoryCounts = await getCategoryCounts(
      supabase,
      user.id,
      totalCount
    );

    const requestedCategory = searchParams.get('category');

    const filters = {
      user_id: user.id,
      type: (searchParams.get('type') as any) || undefined,
      category: requestedCategory
        ? (resolveCategory(requestedCategory, categoryCounts) as any)
        : undefined,
      priority: (searchParams.get('priority') as any) || undefined,
      status: (searchParams.get('status') as any) || undefined,
      is_read: searchParams.get('is_read')
        ? searchParams.get('is_read') === 'true'
        : undefined,
      is_archived: searchParams.get('is_archived')
        ? searchParams.get('is_archived') === 'true'
        : undefined,
      search: searchParams.get('search') || undefined,
      from_date: searchParams.get('from_date') || undefined,
      to_date: searchParams.get('to_date') || undefined,
      limit,
      offset
    };

    // Pass the route's cookie-scoped server client so the query runs as
    // `authenticated`. The service's module-level fallback is anon-keyed and
    // would trigger 500 "permission denied for function fn_notification_is_for_user"
    // when an RLS policy on user_notifications invokes that function.
    const notifications = await getNotifications(filters, supabase);

    // Response keys cover both consumer shapes:
    //   - `data` / `count` — original API contract (used by future server callers)
    //   - `notifications` / `unread_count` / `has_more` — what hooks/use-notifications.ts
    //     expects for the /notifications page list. Without these, the page renders
    //     "No notifications yet" even though the API returns rows. Bug found 2026-05-04.
    //
    // `count` stays page-scoped (existing callers read it as "rows in this
    // response"). `unread_count` is now the caller's GLOBAL unread — its old
    // value was `notifications.filter((n) => !n.is_read).length`, a page length
    // capped at the requested limit, which under-reported 258 unread as 18.
    const effectiveLimit = limit ?? 20;
    return NextResponse.json({
      data: notifications,
      count: notifications.length,
      notifications,
      unread_count: unreadCount,
      total_count: totalCount,
      category_counts: categoryCounts,
      has_more: notifications.length === effectiveLimit
    });
  } catch (error: any) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Handle bulk operations
    if (body.action === 'bulk_update') {
      await bulkUpdateNotifications(body.data);
      return NextResponse.json({ success: true });
    }

    if (body.action === 'mark_all_read') {
      await markAllAsRead(user.id);
      return NextResponse.json({ success: true });
    }

    if (body.action === 'delete_all_read') {
      await deleteAllRead(user.id);
      return NextResponse.json({ success: true });
    }

    // Create notification
    const validatedData = createNotificationSchema.parse(body);
    const notification = await createNotification(validatedData as any);

    return NextResponse.json({
      data: notification,
      message: 'Notification created successfully'
    });
  } catch (error: any) {
    console.error('Error creating notification:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
