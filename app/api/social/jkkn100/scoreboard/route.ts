export const dynamic = 'force-dynamic';

/**
 * GET /api/social/jkkn100/scoreboard — JKKN100 reel countdown scoreboard.
 *
 * For every tracked Instagram account and every #JKKN100DayNN tag seen since
 * `since`, says YES (with minutes after the day's anchor reel), NO, or UNKNOWN
 * (with the reason). The rules live in lib/services/social/jkkn100-scoreboard.ts.
 *
 * Query:
 *   since   — ISO date/time, default 2026-10-01. Posts before it are ignored.
 *   anchor  — the Instagram username whose post sets each day's clock. Left
 *             out entirely it is @jkkninstitutions, the account the Director
 *             uploads from first. Sent empty (`?anchor=`) there is no anchor
 *             account and every day is timed from its own earliest post.
 *             When the anchor has no post for a day, that day falls back to
 *             the earliest post of the day (and says so).
 *   collab  — the hand-set collab lists, `40:handle1,handle2;39:handle3`.
 *             Those accounts are not expected to upload their own copy, so
 *             they read COLLAB for that day instead of NO. Anything in the
 *             text we could not use comes back in `warnings`.
 *
 * Read-only. Reads through the caller's session, so ig_accounts / ig_posts /
 * profiles RLS decides which rows come back — no service-role client.
 * ig_accounts.access_token is never selected.
 *
 * Auth: signed out → 401. Without social.view → 403 (the key the sibling
 * Director surfaces — /admission/social/governance and /loop — gate on, and
 * the key MENU_PERMISSIONS gives this page). A failed permission check or any
 * read error → 500, never a silent empty board.
 */

import { NextResponse, connection, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  buildJkkn100Scoreboard,
  parseJkkn100Collab,
  JKKN100_COLLAB_MAX_LENGTH,
  JKKN100_DEFAULT_ANCHOR,
  JKKN100_DEFAULT_SINCE,
  JKKN100_MAX_PAGES,
  JKKN100_PAGE_SIZE,
  type Jkkn100Account,
  type Jkkn100Post,
} from '@/lib/services/social/jkkn100-scoreboard';

const MODULE = 'social/jkkn100';
const USERNAME_RE = /^[A-Za-z0-9._]{1,30}$/;

function fail(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

interface AccountRow {
  id: string;
  username: string | null;
  institution_id: string | null;
  department_id: string | null;
  status: string | null;
  metrics_source: string | null;
  last_polled_at: string | null;
  connected_by: string | null;
}

export async function GET(request: NextRequest) {
  await connection();

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail('Unauthorized', 401);

    const { data: canView, error: permError } = await supabase.rpc('user_has_permission', {
      permission_name: 'social.view',
    });
    if (permError) {
      logger.error(MODULE, 'permission check failed', permError);
      return fail('Could not check your access. Please try again.', 500);
    }
    if (canView !== true) {
      return fail(
        'You do not have access to the JKKN100 scoreboard. Ask an administrator to grant the Social Media permissions to your role.',
        403
      );
    }

    const { searchParams } = new URL(request.url);
    const sinceRaw = searchParams.get('since')?.trim() || JKKN100_DEFAULT_SINCE;
    const sinceMs = Date.parse(sinceRaw);
    if (!/^\d{4}-\d{2}-\d{2}/.test(sinceRaw) || !Number.isFinite(sinceMs)) {
      return fail('since must be a date like 2026-10-01.', 400);
    }
    const since = new Date(sinceMs).toISOString();

    // Absent means the default anchor account; present-but-empty means the
    // caller asked for no anchor at all (every day timed from its own
    // earliest post). Those are different answers, so they need telling apart.
    const anchorParam = searchParams.get('anchor');
    const anchorRaw =
      anchorParam === null
        ? JKKN100_DEFAULT_ANCHOR
        : anchorParam.trim().replace(/^@/, '') || null;
    if (anchorRaw && !USERNAME_RE.test(anchorRaw)) {
      return fail('anchor must be an Instagram username.', 400);
    }

    const collabRaw = searchParams.get('collab');
    if (collabRaw && collabRaw.length > JKKN100_COLLAB_MAX_LENGTH) {
      return fail(`collab must be shorter than ${JKKN100_COLLAB_MAX_LENGTH} characters.`, 400);
    }
    // Anything unusable in the text becomes a warning on the board, not a
    // refusal: a typo in a shared link must not blank the whole scoreboard.
    const collab = parseJkkn100Collab(collabRaw);

    // ── Accounts (every tracked row; status only changes the verdict) ──────
    const { data: accountRows, error: accountError } = await supabase
      .from('ig_accounts')
      .select(
        'id, username, institution_id, department_id, status, metrics_source, last_polled_at, connected_by'
      )
      .order('username', { ascending: true });
    if (accountError) {
      logger.error(MODULE, 'ig_accounts read failed', accountError);
      return fail('Could not read the Instagram accounts.', 500);
    }
    const accounts = (accountRows ?? []) as AccountRow[];

    // ── Runner names: best-effort, so a name problem never blanks the board ─
    const runnerNames = new Map<string, string>();
    const runnerIds = [...new Set(accounts.map((a) => a.connected_by).filter((v): v is string => !!v))];
    if (runnerIds.length > 0) {
      const { data: runnerRows, error: runnerError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', runnerIds);
      if (runnerError) {
        logger.warn(MODULE, 'runner name read failed; showing without names', runnerError);
      }
      for (const r of (runnerRows ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
        runnerNames.set(r.id, r.full_name || r.email || '');
      }
    }

    // ── Tagged posts, paged in 1,000s with a hard cap ─────────────────────
    const readPosts = (from: number, to: number) =>
      supabase
        .from('ig_posts')
        .select('id, account_id, caption, posted_at, permalink, media_type')
        .ilike('caption', '%#JKKN100Day%')
        .gte('posted_at', since)
        .order('posted_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to);

    const posts: Jkkn100Post[] = [];
    let readEverything = false;
    for (let page = 0; page < JKKN100_MAX_PAGES; page += 1) {
      const from = page * JKKN100_PAGE_SIZE;
      const { data, error } = await readPosts(from, from + JKKN100_PAGE_SIZE - 1);
      if (error) {
        logger.error(MODULE, 'ig_posts read failed', error);
        return fail('Could not read the tagged posts.', 500);
      }
      const rows = (data ?? []) as Jkkn100Post[];
      posts.push(...rows);
      if (rows.length < JKKN100_PAGE_SIZE) {
        readEverything = true;
        break;
      }
    }
    if (!readEverything) {
      // Every page came back full, which says nothing about whether there is
      // more. Ask for one row past the cap: exactly 5,000 posts is a complete
      // board, 5,001 is one we would be quietly truncating.
      const cap = JKKN100_MAX_PAGES * JKKN100_PAGE_SIZE;
      const { data, error } = await readPosts(cap, cap);
      if (error) {
        logger.error(MODULE, 'ig_posts read failed', error);
        return fail('Could not read the tagged posts.', 500);
      }
      if ((data ?? []).length > 0) {
        logger.error(MODULE, 'tagged post read ran past the page cap', { cap, since });
        return fail(`More than ${cap} tagged posts since ${sinceRaw}; narrow the date.`, 500);
      }
    }

    const boardAccounts: Jkkn100Account[] = accounts.map((a) => ({
      ...a,
      connected_by_name: a.connected_by ? runnerNames.get(a.connected_by) || null : null,
    }));
    const board = buildJkkn100Scoreboard(boardAccounts, posts, {
      anchorUsername: anchorRaw,
      collab: collab.byDay,
    });

    return NextResponse.json({
      success: true,
      data: {
        ...board,
        warnings: [...collab.warnings, ...board.warnings],
        since: sinceRaw,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    logger.error(MODULE, 'unexpected error', err);
    return fail('Unexpected error loading the JKKN100 scoreboard.', 500);
  }
}
