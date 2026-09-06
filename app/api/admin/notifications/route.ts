export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse , connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { NotificationTargeting } from '@/lib/notifications/target-audience';
import {
  collectRecipientNamePreviews,
  pickPreviewNames,
  type RecipientProfile
} from '@/lib/notifications/target-audience-preview';

/**
 * Make a user search term safe to embed inside a PostgREST `.or()` filter
 * string. PostgREST parses that string structurally: a comma splits it into
 * separate OR clauses and parentheses open sub-groups, so a raw term like
 * `a,status.eq.deleted` would inject an extra filter. `%`/`_` are also LIKE
 * wildcards. We strip the structural metacharacters (`, ( ) \`) and the LIKE
 * wildcards, collapse whitespace, and cap length. Returns '' when nothing
 * usable remains, so the caller can skip the filter entirely.
 */
function sanitizeSearch(raw: string): string {
  return raw
    .replace(/[,()\\%_*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    // Clamp caller-supplied limit to avoid unbounded fetches on admin view.
    // Default 500 covers ~a week of activity even with a noisy notification
    // source (e.g. lead-rescue cron that fires 100+ per day).
    const requestedLimit = parseInt(searchParams.get('limit') || '500', 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 1000)
      : 500;

    // Kind filter: defaults to 'announcement' so the /admin/notifications page
    // shows user-composed messages only. Operational work items (dashboard:*
    // cron output) are routed elsewhere. Pass ?kind=all or ?kind=work_item to
    // override. See supabase/setup/01_tables.sql — 2026-04-24 split.
    const kindParam = searchParams.get('kind') ?? 'announcement';
    const kindFilter = kindParam === 'all' ? null : kindParam;

    let query = (supabase as any).from('notifications').select(`
        id, title, body, url, icon, priority, category, kind, sent_at,
        expires_at, targeting, created_by, created_at
      `);

    if (kindFilter) {
      query = query.eq('kind', kindFilter);
    }

    if (search) {
      const s = sanitizeSearch(search);
      if (s) {
        query = query.or(
          `title.ilike.%${s}%,body.ilike.%${s}%,category.ilike.%${s}%`
        );
      }
    }

    const { data: notifications, error } = await query
      .order('sent_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    // Person-targeted sends name profile ids inside `targeting` and set none of
    // the structural keys, so the list card had nothing to describe a blast
    // radius from. Resolve just the two names each card displays — for the
    // whole page in ONE query, never one per notification and never one per
    // recipient. Each card's total comes from its own id array's length.
    //
    // Failure here is deliberately non-fatal: without names the card falls back
    // to a plain count ("273 people"), which is still true.
    const rows = (notifications || []) as Array<{
      targeting?: NotificationTargeting | null;
    }>;
    const { perRow, lookupIds } = collectRecipientNamePreviews(
      rows.map((row) => row?.targeting)
    );

    if (lookupIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', lookupIds);

      const profilesById = new Map<string, RecipientProfile>(
        ((profiles || []) as RecipientProfile[])
          .filter((profile) => typeof profile?.id === 'string')
          .map((profile) => [profile.id as string, profile])
      );

      rows.forEach((row, index) => {
        if (!row?.targeting) return;
        const names = pickPreviewNames(perRow[index], profilesById);
        if (names.length > 0) row.targeting.user_names = names;
      });
    }

    return NextResponse.json({ notifications });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}
