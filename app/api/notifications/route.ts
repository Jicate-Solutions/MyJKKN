export const dynamic = 'force-dynamic';

// app/api/notifications/route.ts

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getNotifications,
  getNotificationCounts,
  getNotificationEventRollups,
  createNotification,
  bulkUpdateNotifications,
  markAllAsRead,
  deleteAllRead
} from '@/lib/services/notification/notification-service';
import { createNotificationSchema } from '@/types/notification';

// --- Authorisation guard for notification creation -------------------------
// Until this guard existed, POST here ran NO permission check at all: it
// authenticated the caller, parsed the body and inserted. The only real gate
// was the RLS policy `notifications_insert_admins`
// (WITH CHECK is_super_admin() OR is_admin()), and an RLS refusal in this
// stack is SILENT — zero rows with a null error — so an unauthorised sender
// got an opaque failure rather than a reason. CLAUDE.md rule 27 requires the
// refusal to be explicit and structured, so the checks below run server-side
// before createNotification() and return 403 with plain English.
//
// These constants are deliberately local to this file so the route stays
// independently mergeable.
const ADMIN_ROLE_KEYS = ['admin', 'super_admin', 'administrator'];

// 'student' is the literal DB role value for a learner — the ONLY learner role
// key in this system. It is a stored value, not prose.
const LEARNER_ROLE_KEY = 'student';

// The cluster contains school institutions holding minors. An elected Learners
// Council office-bearer must never be able to reach them, so school-ness is
// resolved by name match against the live institutions table rather than by
// hardcoded UUIDs (which drift as institutions are added).
const SCHOOL_NAME_PATTERNS = ['%school%', '%vidhyalya%', '%cbse%', '%matric%'];

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter(
      (entry): entry is string =>
        typeof entry === 'string' && entry.trim().length > 0
    );
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return [value];
  }
  return [];
}

/**
 * Collapse every shape the targeting payload takes in this codebase into one
 * view. Callers post `targeting` as an OBJECT
 * (`{ target_roles, institution_ids }`), as an ARRAY of such objects, or with
 * the same fields flattened onto the body root — so the guard reads all three.
 * Assuming a single shape would let a sender pick another one and slip past.
 *
 * It reads the RAW body, not the zod-validated data: createNotificationSchema
 * is a non-strict object, so it silently STRIPS these unknown keys and the
 * validated result never carries targeting at all.
 */
function collectTargeting(body: any): {
  roles: string[];
  institutionIds: string[];
} {
  const blocks: any[] = [];
  const raw = body?.targeting;
  if (Array.isArray(raw)) {
    blocks.push(...raw.filter((entry) => entry && typeof entry === 'object'));
  } else if (raw && typeof raw === 'object') {
    blocks.push(raw);
  }
  if (body && typeof body === 'object') {
    blocks.push(body);
  }

  const roles: string[] = [];
  const institutionIds: string[] = [];
  for (const block of blocks) {
    roles.push(...toStringList(block.target_roles));
    institutionIds.push(
      ...toStringList(block.institution_ids),
      ...toStringList(block.institution_id)
    );
  }
  return {
    roles: Array.from(new Set(roles)),
    institutionIds: Array.from(new Set(institutionIds))
  };
}

// One flat shape rather than a discriminated union: this project compiles with
// `strict: false`, under which TypeScript cannot narrow on the `ok` literal.
type GuardResult = { ok: boolean; error?: string };

/**
 * Decide whether this caller may create a notification with this payload.
 * Admins are unaffected. Everyone else must be a sitting Learners Council
 * office-bearer AND must be targeting learners only.
 */
async function authorizeNotificationCreate(
  supabase: any,
  userId: string,
  body: any
): Promise<GuardResult> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, is_super_admin')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) {
    console.error(
      'Error resolving sender profile for notification guard:',
      profileError
    );
    return {
      ok: false,
      error: 'We could not confirm your permissions. Please try again.'
    };
  }

  // Admins keep today's behaviour exactly — no new refusals for them.
  if (
    profile?.is_super_admin === true ||
    ADMIN_ROLE_KEYS.includes(String(profile?.role ?? ''))
  ) {
    return { ok: true };
  }

  // The only non-admins with a legitimate reason to broadcast are the elected
  // Learners Council office-bearers: an ACTIVE lc_members row sitting on an
  // lc_positions seat in the 'executive' category. Category is compared in JS
  // rather than as an embedded filter so a multi-seat member is handled and a
  // relationship returned as either an object or a single-element array still
  // resolves.
  const { data: memberships, error: membershipError } = await supabase
    .from('lc_members')
    .select('id, position:lc_positions(category)')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (membershipError) {
    console.error(
      'Error resolving Learners Council membership for notification guard:',
      membershipError
    );
    return {
      ok: false,
      error: 'We could not confirm your permissions. Please try again.'
    };
  }

  const isOfficeBearer = (memberships ?? []).some((row: any) => {
    const position = row?.position;
    const seats = Array.isArray(position) ? position : [position];
    return seats.some((seat: any) => seat?.category === 'executive');
  });

  if (!isOfficeBearer) {
    return {
      ok: false,
      error: 'You do not have permission to send notifications.'
    };
  }

  const { roles, institutionIds } = collectTargeting(body);

  // Fail CLOSED on an absent or empty audience. Downstream, "no roles named"
  // reads as "everyone", which is precisely what an office-bearer may not do.
  if (roles.length === 0) {
    return {
      ok: false,
      error:
        'Learners Council announcements must name their audience. Select the learner role before sending.'
    };
  }

  if (roles.some((role) => role !== LEARNER_ROLE_KEY)) {
    return {
      ok: false,
      error:
        'Learners Council announcements can only be sent to learners, not to team members or other roles.'
    };
  }

  // Fail CLOSED again: an empty institution list is cluster-wide, which would
  // sweep in the school institutions that hold minors.
  if (institutionIds.length === 0) {
    return {
      ok: false,
      error:
        'Learners Council announcements must name the institutions they are sent to.'
    };
  }

  const { data: schoolMatches, error: institutionError } = await supabase
    .from('institutions')
    .select('id')
    .in('id', institutionIds)
    .or(SCHOOL_NAME_PATTERNS.map((p) => `name.ilike.${p}`).join(','));

  if (institutionError) {
    console.error(
      'Error screening target institutions for notification guard:',
      institutionError
    );
    return {
      ok: false,
      error:
        'We could not confirm the institutions you selected. Please try again.'
    };
  }

  if ((schoolMatches ?? []).length > 0) {
    return {
      ok: false,
      error:
        'Learners Council announcements cannot be sent to school institutions.'
    };
  }

  return { ok: true };
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

    const filters = {
      user_id: user.id,
      type: (searchParams.get('type') as any) || undefined,
      category: (searchParams.get('category') as any) || undefined,
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
      // Fetch only one rollup's rows (matched on notifications.metadata->>event)
      // so the inbox can expand a rollup without paging the whole inbox.
      // Absent => identical behaviour to before this param existed.
      event: searchParams.get('event') || undefined,
      limit,
      offset
    };

    // Pass the route's cookie-scoped server client so the query runs as
    // `authenticated`. The service's module-level fallback is anon-keyed and
    // would trigger 500 "permission denied for function fn_notification_is_for_user"
    // when an RLS policy on user_notifications invokes that function.
    // Counts are GLOBAL and must not depend on this request's page/limit, so
    // they come from COUNT queries rather than from the page we just fetched.
    const [notifications, counts, eventRollups] = await Promise.all([
      getNotifications(filters, supabase),
      getNotificationCounts(user.id, supabase),
      getNotificationEventRollups(user.id, supabase)
    ]);

    // Response keys cover both consumer shapes:
    //   - `data` / `count` — original API contract (used by future server callers)
    //   - `notifications` / `unread_count` / `has_more` — what hooks/use-notifications.ts
    //     expects for the /notifications page list. Without these, the page renders
    //     "No notifications yet" even though the API returns rows. Bug found 2026-05-04.
    //
    // `count` stays page-scoped (rows in THIS response) — that is its original
    // contract. `total_count` is the global figure; they are different numbers
    // on purpose.
    //
    // unread_count was `notifications.filter((n) => !n.is_read).length` until
    // 2026-07-15 — unread within the RETURNED PAGE. The UI renders it as a
    // global "N unread", and with limit=20 it could never exceed 20: a
    // 258-unread inbox displayed "18 unread". It is now a real COUNT.
    //
    // event_rollups is GLOBAL for the same reason, and exists for the same
    // class of bug one level down: the inbox stacks the 140 ig_silence_alert
    // rows into one row labelled with a count of departments. That count is 35
    // (distinct metadata.ig_user_id) and is NOT derivable from the 20 rows in
    // this response — counting the returned group yields 20, and counting every
    // row after full scroll yields 140. Both have shipped; both are wrong.
    // The label must read event_rollups[].distinct_entities.
    const effectiveLimit = limit ?? 20;
    return NextResponse.json({
      data: notifications,
      count: notifications.length,
      notifications,
      unread_count: counts.unread,
      total_count: counts.total,
      category_counts: counts.byCategory,
      event_rollups: eventRollups,
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

    // Explicit server-side authorisation, ahead of the write. Without it the
    // only gate is RLS, whose refusal is silent (see the note above the guard).
    // The route's session-bound client is passed on purpose: the guard must
    // read profiles/lc_members/institutions as the CALLER, never as anon.
    const guard = await authorizeNotificationCreate(supabase, user.id, body);
    if (!guard.ok) {
      return NextResponse.json(
        { success: false, error: guard.error },
        { status: 403 }
      );
    }

    // Pass THIS route's session-bound server client: the service's module-level
    // client is the browser singleton and would run as `anon` here (RLS reject).
    const notification = await createNotification(
      validatedData as any,
      user.id,
      supabase as any
    );

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
