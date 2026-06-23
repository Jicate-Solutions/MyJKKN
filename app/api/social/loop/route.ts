export const dynamic = 'force-dynamic';

/**
 * /api/social/loop  — the Social Loop Engine data layer.
 *
 * The "loop" is the weekly READ → DECIDE → (act) → LEARN cycle a department runs
 * on its Instagram handle:
 *
 *   READ   — score the last N posts on REAL signal (saves + shares + comments;
 *            never likes), find the format that wins and the bar to beat.
 *   DECIDE — turn that read into one plain-English instruction for next week.
 *   LEARN  — POST closes the cycle: snapshot the read+decide and the human's
 *            one-line learning into social_loop_playbook.
 *
 * GET  /api/social/loop?accountId=<uuid|username>  → { read, decide, playbook, ... }
 * POST /api/social/loop  { accountId?, learning } → closes the current cycle.
 *
 * Mirrors app/api/social/governance/route.ts exactly for auth, client, error
 * shape and the latest-snapshot first-wins reduce. Policy values are read via the
 * canonical fn_get_policy RPC (fail-soft to documented code defaults). The
 * access_token column on ig_accounts is NEVER selected.
 *
 * Auth: any authenticated user holding social.view (super-admins short-circuit
 * inside user_has_permission). Writes (POST) are additionally gated by RLS on
 * social_loop_playbook (a social.manage check) — we do NOT pre-block; an RLS
 * denial surfaces as { success:false, error } with status 403.
 */

import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type {
  LoopPost,
  LoopRead,
  LoopDecide,
  LoopAccount,
  FormatTypeStat,
  FormatLever,
} from '@/lib/types/social-loop';

// ── Documented code defaults (fire until the policy keys are seeded) ──────────
const DEFAULTS = {
  windowSize: 12,
  cycleLengthDays: 7,
} as const;

const DEFAULT_USERNAME = 'jkknpharmacy';
const CAPTION_MAX = 120;
const DOMAIN_TAG = '#apulse';

// ── Row shapes (untyped client — these tables are not in the generated types) ─
interface IgAccountRow {
  id: string;
  username: string | null;
  metrics_source: string | null;
}

interface IgPostRow {
  id: string;
  ig_media_id: string | null;
  posted_at: string | null;
  media_type: string | null;
  caption: string | null;
  permalink: string | null;
}

interface IgPostMetricRow {
  post_id: string;
  snapshot_at: string;
  reach: number | null;
  impressions: number | null;
  engagement: number | null;
  saves: number | null;
  shares: number | null;
  comments: number | null;
  likes: number | null;
  plays: number | null;
}

/**
 * Read a policy value directly via fn_get_policy.
 *
 * The loop keys (`social.loop.*`) are NOT in lib/policies/keys.ts' POLICY_KEYS
 * union (a sibling agent owns that file), so the typed getPolicy<T>() wrapper
 * would reject them at compile time. We call the same SECURITY DEFINER RPC the
 * wrapper uses, with the identical fail-soft contract: null on any error.
 */
async function getLoopPolicy<T = unknown>(
  supabase: SupabaseClient,
  key: string
): Promise<T | null> {
  const { data, error } = await supabase.rpc('fn_get_policy', {
    p_key: key,
    p_scope_id: null,
  });
  if (error) {
    console.warn(`[social-loop] fn_get_policy failed for ${key}, using default`, error.message);
    return null;
  }
  return data as T;
}

/** realSignal — the only thing scored. Likes are vanity and excluded. */
function realSignal(m: IgPostMetricRow | undefined): number {
  if (!m) return 0;
  return (m.saves ?? 0) + (m.shares ?? 0) + (m.comments ?? 0);
}

/** Result of computeLoop — everything GET returns and POST snapshots. */
interface ComputedLoop {
  account: LoopAccount;
  read: LoopRead;
  decide: LoopDecide;
  config: { windowSize: number; cycleLengthDays: number };
  readable: boolean;
  notReadableMessage?: string;
}

/**
 * Resolve an account by uuid OR username, defaulting to jkknpharmacy.
 * Returns null when the account cannot be found.
 */
async function resolveAccount(
  db: SupabaseClient,
  accountId?: string | null
): Promise<{ account: IgAccountRow | null; error?: string }> {
  const isUuid =
    typeof accountId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountId.trim());

  let q = db.from('ig_accounts').select('id, username, metrics_source');
  if (accountId && accountId.trim().length > 0) {
    q = isUuid ? q.eq('id', accountId.trim()) : q.eq('username', accountId.trim());
  } else {
    q = q.eq('username', DEFAULT_USERNAME);
  }

  const { data, error } = await q.limit(1).maybeSingle();
  if (error) return { account: null, error: error.message };
  return { account: (data as IgAccountRow) ?? null };
}

/**
 * Shared loop computation — used by both GET (return) and POST (snapshot).
 * Reads the last `windowSize` posts for the account and the latest metric
 * snapshot per post, then computes read{posts,formatLever,barToBeat,domainNote}
 * and decide{formatInstruction,barToBeat,nextInstruction,domainHypothesis}.
 */
async function computeLoop(
  supabase: SupabaseClient,
  accountId?: string | null
): Promise<{ ok: true; result: ComputedLoop } | { ok: false; error: string; status: number }> {
  const db = supabase as unknown as SupabaseClient;

  // ── Resolve account (uuid | username | default jkknpharmacy) ───────────────
  const { account: acctRow, error: acctErr } = await resolveAccount(db, accountId);
  if (acctErr) {
    return { ok: false, error: `Failed to read ig_accounts: ${acctErr}`, status: 500 };
  }
  if (!acctRow) {
    return { ok: false, error: 'Instagram account not found', status: 404 };
  }
  const account: LoopAccount = {
    id: acctRow.id,
    username: acctRow.username,
    metrics_source: acctRow.metrics_source,
  };

  // ── Config (fail-soft to documented defaults) ──────────────────────────────
  const [windowRaw, cycleRaw] = await Promise.all([
    getLoopPolicy<number>(supabase, 'social.loop.window_size'),
    getLoopPolicy<number>(supabase, 'social.loop.cycle_length_days'),
  ]);
  const windowSize = typeof windowRaw === 'number' ? windowRaw : DEFAULTS.windowSize;
  const cycleLengthDays = typeof cycleRaw === 'number' ? cycleRaw : DEFAULTS.cycleLengthDays;

  // ── Window: last `windowSize` posts (newest first) ─────────────────────────
  const { data: postsRaw, error: postsErr } = await db
    .from('ig_posts')
    .select('id, ig_media_id, posted_at, media_type, caption, permalink')
    .eq('account_id', acctRow.id)
    .order('posted_at', { ascending: false })
    .limit(windowSize);
  if (postsErr) {
    return { ok: false, error: `Failed to read ig_posts: ${postsErr.message}`, status: 500 };
  }
  const postRows = (postsRaw as IgPostRow[]) ?? [];
  const postIds = postRows.map((p) => p.id);

  // ── Latest metric snapshot per post (first-wins reduce, mirrors governance) ─
  const latestByPost = new Map<string, IgPostMetricRow>();
  if (postIds.length > 0) {
    const { data: metricsRaw, error: metErr } = await db
      .from('ig_post_metrics')
      .select(
        'post_id, snapshot_at, reach, impressions, engagement, saves, shares, comments, likes, plays'
      )
      .in('post_id', postIds)
      .order('snapshot_at', { ascending: false });
    if (metErr) {
      return { ok: false, error: `Failed to read ig_post_metrics: ${metErr.message}`, status: 500 };
    }
    for (const m of (metricsRaw as IgPostMetricRow[]) ?? []) {
      // ordered desc → first row seen for a post is its latest snapshot.
      if (!latestByPost.has(m.post_id)) latestByPost.set(m.post_id, m);
    }
  }

  // ── Build scored posts (sorted by posted_at desc, the window order) ─────────
  const scored: LoopPost[] = postRows.map((p) => {
    const m = latestByPost.get(p.id);
    const caption =
      p.caption != null && p.caption.length > CAPTION_MAX
        ? p.caption.slice(0, CAPTION_MAX)
        : p.caption;
    return {
      id: p.id,
      ig_media_id: p.ig_media_id,
      posted_at: p.posted_at,
      media_type: p.media_type,
      caption,
      permalink: p.permalink,
      reach: m?.reach ?? 0,
      impressions: m?.impressions ?? 0,
      engagement: m?.engagement ?? 0,
      saves: m?.saves ?? 0,
      shares: m?.shares ?? 0,
      comments: m?.comments ?? 0,
      likes: m?.likes ?? 0,
      plays: m?.plays ?? 0,
      realSignal: realSignal(m),
      rank: 0, // assigned below
      isBarToBeat: false, // assigned below
    };
  });

  // ── barToBeat + rank + isBarToBeat ─────────────────────────────────────────
  const barToBeat = scored.reduce((max, p) => Math.max(max, p.realSignal), 0);
  // Rank by realSignal desc (stable). rank 1 = highest.
  const bySignal = [...scored].sort((a, b) => b.realSignal - a.realSignal);
  const rankById = new Map<string, number>();
  bySignal.forEach((p, i) => rankById.set(p.id, i + 1));
  let barMarked = false;
  for (const p of scored) {
    p.rank = rankById.get(p.id) ?? 0;
    // Mark exactly one post as the bar-to-beat (the first, highest-ranked match).
    if (!barMarked && barToBeat > 0 && p.realSignal === barToBeat) {
      p.isBarToBeat = true;
      barMarked = true;
    }
  }

  // ── formatLever: group by media_type, avg realSignal per type ───────────────
  const groups = new Map<string, { sum: number; sumLikes: number; n: number }>();
  for (const p of scored) {
    const type = p.media_type ?? 'unknown';
    const g = groups.get(type) ?? { sum: 0, sumLikes: 0, n: 0 };
    g.sum += p.realSignal;
    g.sumLikes += p.likes;
    g.n += 1;
    groups.set(type, g);
  }
  const byType: FormatTypeStat[] = [...groups.entries()].map(([type, g]) => ({
    type,
    n: g.n,
    avg: g.n > 0 ? g.sum / g.n : 0,
    avgLikes: g.n > 0 ? g.sumLikes / g.n : 0,
  }));
  let best: FormatTypeStat | null = null;
  let worst: FormatTypeStat | null = null;
  for (const t of byType) {
    if (best === null || t.avg > best.avg) best = t;
    if (worst === null || t.avg < worst.avg) worst = t;
  }
  const multiple = best && worst ? best.avg / Math.max(worst.avg, 1) : 0;
  const formatLever: FormatLever = { byType, best, worst, multiple };

  // ── domainNote: posts whose caption (ci) contains #apulse ──────────────────
  const tagged = scored.filter(
    (p) => (p.caption ?? '').toLowerCase().includes(DOMAIN_TAG)
  ).length;
  const total = scored.length;
  const domainMessage =
    tagged === 0
      ? '0 domain-tagged posts yet — domain resonance is untested.'
      : `${tagged} of ${total} posts carry ${DOMAIN_TAG}.`;

  const read: LoopRead = {
    posts: scored,
    formatLever,
    barToBeat,
    domainNote: { tagged, total, message: domainMessage },
  };

  // ── DECIDE: instructions for the next cycle (guard nulls) ───────────────────
  const formatInstruction =
    best && worst
      ? `Next post = ${best.type}. ${best.type} earns ~${Math.round(multiple)}× the real signal of ${worst.type}.`
      : 'Not enough posts in the window to choose a format yet. Publish a few and re-run the loop.';
  const nextInstruction = `Produce ONE ${best?.type ?? 'reel'} that applies a domain idea and shows the result. Target to beat: real-signal ${barToBeat}.`;
  const domainHypothesis = domainMessage;

  const decide: LoopDecide = {
    formatInstruction,
    barToBeat,
    nextInstruction,
    domainHypothesis,
  };

  // ── readability ────────────────────────────────────────────────────────────
  const readable = account.metrics_source === 'graph';
  const notReadableMessage = readable
    ? undefined
    : "This handle reads via Instagram's public window (business_discovery), which does not return engagement — saves, shares and comments come back as 0, so real-signal scoring reads 0 across the board. Move it to a graph-API source (add the Page to the Business Manager portfolio) to read the loop.";

  return {
    ok: true,
    result: {
      account,
      read,
      decide,
      config: { windowSize, cycleLengthDays },
      readable,
      notReadableMessage,
    },
  };
}

// ── Auth gate shared by GET + POST ───────────────────────────────────────────
async function authGate(supabase: SupabaseClient): Promise<NextResponse | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  // Permission gate (defense-in-depth; RLS is the real boundary).
  // user_has_permission merges all roles with OR and short-circuits for super-admins.
  const { data: canView } = await supabase.rpc('user_has_permission', {
    permission_name: 'social.view',
  });
  if (canView !== true) {
    return NextResponse.json(
      {
        success: false,
        error:
          'You do not have access to the Social Loop. Ask an administrator to grant the Social Media permissions to your role.',
      },
      { status: 403 }
    );
  }
  return null;
}

export async function GET(request: Request) {
  await connection();

  try {
    const supabase = await createServerSupabaseClient();
    const denied = await authGate(supabase as unknown as SupabaseClient);
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');

    const computed = await computeLoop(supabase as unknown as SupabaseClient, accountId);
    if (!computed.ok) {
      return NextResponse.json(
        { success: false, error: computed.error },
        { status: computed.status }
      );
    }
    const { account, read, decide, config, readable, notReadableMessage } = computed.result;

    // ── Playbook: last 12 closed cycles for this account (newest first) ────────
    const db = supabase as unknown as SupabaseClient;
    const { data: playbookRaw, error: pbErr } = await db
      .from('social_loop_playbook')
      .select('id, account_id, cycle_no, week_start, read_summary, decide, learning, created_by, created_at')
      .eq('account_id', account.id)
      .order('cycle_no', { ascending: false })
      .limit(12);
    if (pbErr) {
      return NextResponse.json(
        { success: false, error: `Failed to read social_loop_playbook: ${pbErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      account,
      read,
      decide,
      playbook: playbookRaw ?? [],
      config,
      readable,
      ...(notReadableMessage ? { notReadableMessage } : {}),
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Unexpected error computing the loop',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  await connection();

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    // social.view to reach the loop; the WRITE is gated by RLS on the table
    // (a social.manage check). We do NOT pre-block the insert — an RLS denial
    // returns as { success:false, error } with 403 below.
    const { data: canView } = await supabase.rpc('user_has_permission', {
      permission_name: 'social.view',
    });
    if (canView !== true) {
      return NextResponse.json(
        {
          success: false,
          error:
            'You do not have access to the Social Loop. Ask an administrator to grant the Social Media permissions to your role.',
        },
        { status: 403 }
      );
    }

    // ── Body ───────────────────────────────────────────────────────────────
    let body: { accountId?: string; learning?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 }
      );
    }
    const learning = typeof body.learning === 'string' ? body.learning.trim() : '';
    if (learning.length === 0) {
      return NextResponse.json(
        { success: false, error: 'A one-line learning is required to close the cycle.' },
        { status: 400 }
      );
    }

    // ── Recompute the current read + decide to snapshot ──────────────────────
    const computed = await computeLoop(supabase as unknown as SupabaseClient, body.accountId);
    if (!computed.ok) {
      return NextResponse.json(
        { success: false, error: computed.error },
        { status: computed.status }
      );
    }
    const { account, read, decide } = computed.result;

    const db = supabase as unknown as SupabaseClient;

    // ── cycle_no = (max existing for account) + 1, else 0 ────────────────────
    const { data: maxRow, error: maxErr } = await db
      .from('social_loop_playbook')
      .select('cycle_no')
      .eq('account_id', account.id)
      .order('cycle_no', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxErr) {
      return NextResponse.json(
        { success: false, error: `Failed to read social_loop_playbook: ${maxErr.message}` },
        { status: 500 }
      );
    }
    const existingMax =
      maxRow && typeof (maxRow as { cycle_no: number }).cycle_no === 'number'
        ? (maxRow as { cycle_no: number }).cycle_no
        : null;
    const cycle_no = existingMax === null ? 0 : existingMax + 1;

    const weekStart = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (today)

    // ── Insert — RLS (social.manage) is the write boundary ───────────────────
    const { data: inserted, error: insErr } = await db
      .from('social_loop_playbook')
      .insert({
        account_id: account.id,
        cycle_no,
        week_start: weekStart,
        read_summary: read,
        decide,
        learning,
        created_by: user.id,
      })
      .select('id, account_id, cycle_no, week_start, read_summary, decide, learning, created_by, created_at')
      .single();

    if (insErr) {
      // RLS denial (42501 / "row-level security") → 403; other errors → 500.
      const isRls =
        insErr.code === '42501' ||
        /row-level security|permission denied|violates row-level/i.test(insErr.message);
      return NextResponse.json(
        { success: false, error: insErr.message },
        { status: isRls ? 403 : 500 }
      );
    }

    return NextResponse.json({ success: true, entry: inserted });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Unexpected error closing the cycle',
      },
      { status: 500 }
    );
  }
}
