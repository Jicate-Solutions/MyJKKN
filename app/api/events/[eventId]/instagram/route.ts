export const dynamic = 'force-dynamic';

// ============================================================================
// /api/events/[eventId]/instagram — an event's Instagram reception.
//
//   GET    → posts already linked to this event with their real signal
//            (saves + shares + comments), the total, and time-window
//            SUGGESTIONS that a human must confirm.
//   POST   { ig_url } → link one post, resolved from a pasted Instagram URL.
//   DELETE ?link_id=  → unlink one post.
//
// ---------------------------------------------------------------------------
// Reused, not reinvented
// ---------------------------------------------------------------------------
//   • URL → ig_posts resolution is the AI Pulse path: extractIgShortcode()
//     then an ilike on ig_posts.permalink. Copied in behaviour from
//     app/api/ai-pulse/submit/publication/route.ts, including the poller-lag
//     wording — a post published minutes ago genuinely is not here yet.
//   • "Engagement" means saves + shares + comments, never likes, per
//     app/api/social/loop/route.ts.
//
// ---------------------------------------------------------------------------
// Authority split (deliberate)
// ---------------------------------------------------------------------------
// Writes go through the SESSION client, so RLS on event_ig_posts is the
// authority — events.social.manage plus institution access. The route never
// pre-judges a write with its own role check and never writes links with the
// service-role client.
//
// The service-role client is used ONLY to read Instagram rows (ig_posts,
// ig_post_metrics, ig_accounts). RLS on those requires social.instagram.view,
// which event coordinators do not hold, and this feature would otherwise
// render an empty card to exactly the people it is for. The reads are scoped:
// the single post matching a submitted shortcode, or the posts already linked
// to this event / inside this event's date window.
//
// Failure is always explicit (house rule #27): a denial returns
// { success:false, error } with a status, never a silent no-op or a redirect.
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import {
  getAuthUser,
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase/server';
import {
  extractIgShortcode,
  latestSnapshotByPost,
  realSignal,
  receptionCaveats,
  signalUnavailable,
  suggestionWindow,
  sumReception,
  type EventIgPost,
  type EventIgReception,
  type IgMetricSnapshot,
} from '@/lib/services/events/event-ig-reception-service';
import { logger } from '@/lib/utils/enhanced-logger';

const MODULE = 'events/instagram';
const SUGGESTION_LIMIT = 12;

interface IgPostRow {
  id: string;
  permalink: string | null;
  caption: string | null;
  media_type: string | null;
  posted_at: string | null;
  account_id: string;
}

interface IgAccountRow {
  id: string;
  username: string | null;
  institution_id: string | null;
  metrics_source: string | null;
}

/**
 * Assemble EventIgPost rows from posts + accounts + the latest metric each.
 * `access_token` is never selected from ig_accounts anywhere in this file.
 */
function buildPosts(
  posts: IgPostRow[],
  accounts: Map<string, IgAccountRow>,
  metrics: Map<string, IgMetricSnapshot>,
  linkIdByPost: Map<string, string>,
  eventInstitutionId: string | null
): EventIgPost[] {
  return posts.map((p) => {
    const acct = accounts.get(p.account_id) ?? null;
    const m = metrics.get(p.id);
    const unavailable = signalUnavailable(acct?.metrics_source ?? null);
    return {
      link_id: linkIdByPost.get(p.id) ?? null,
      ig_post_id: p.id,
      permalink: p.permalink,
      caption: p.caption,
      media_type: p.media_type,
      posted_at: p.posted_at,
      account_username: acct?.username ?? null,
      other_institution:
        !!eventInstitutionId &&
        !!acct?.institution_id &&
        acct.institution_id !== eventInstitutionId,
      // A business_discovery account reports 0 because engagement is not
      // readable. Keep those out of the arithmetic entirely rather than
      // letting an unreadable post drag the total towards zero.
      saves: unavailable ? 0 : (m?.saves ?? 0),
      shares: unavailable ? 0 : (m?.shares ?? 0),
      comments: unavailable ? 0 : (m?.comments ?? 0),
      reach: m?.reach ?? null,
      realSignal: unavailable ? 0 : realSignal(m),
      signal_unavailable: unavailable,
    };
  });
}

/** Fetch accounts + latest metrics for a set of posts. Service-role, scoped. */
async function hydrate(svc: any, posts: IgPostRow[]) {
  if (posts.length === 0) {
    return {
      accounts: new Map<string, IgAccountRow>(),
      metrics: new Map<string, IgMetricSnapshot>(),
    };
  }
  const accountIds = [...new Set(posts.map((p) => p.account_id))];
  const postIds = posts.map((p) => p.id);

  const [{ data: acctRows }, { data: metricRows }] = await Promise.all([
    svc
      .from('ig_accounts')
      .select('id, username, institution_id, metrics_source')
      .in('id', accountIds),
    svc
      .from('ig_post_metrics')
      .select('post_id, snapshot_at, saves, shares, comments, reach')
      .in('post_id', postIds)
      .order('snapshot_at', { ascending: false }),
  ]);

  const accounts = new Map<string, IgAccountRow>(
    ((acctRows ?? []) as IgAccountRow[]).map((a) => [a.id, a])
  );
  const metrics = latestSnapshotByPost((metricRows ?? []) as IgMetricSnapshot[]);
  return { accounts, metrics };
}

/** Read the event, scoped by the caller's own RLS. */
async function loadEvent(db: any, eventId: string) {
  const { data } = await db
    .from('events')
    .select('id, name, institution_id, start_date, end_date, event_date')
    .eq('id', eventId)
    .maybeSingle();
  return data ?? null;
}

// ---------------------------------------------------------------------------
// GET — reception + suggestions
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
): Promise<NextResponse> {
  const { eventId } = await params;
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Please sign in to see this event.' },
        { status: 401 }
      );
    }

    const db = await createServerSupabaseClient();

    // The event itself, through the caller's RLS. A miss here means the event
    // does not exist OR the caller may not see it; either way there is nothing
    // to show, and we say so rather than rendering an empty panel.
    const event = await loadEvent(db, eventId);
    if (!event) {
      return NextResponse.json(
        {
          success: false,
          error:
            "We can't find this event, or you don't have access to it. Ask an event coordinator for access.",
          code: 'EVENT_NOT_VISIBLE',
        },
        { status: 404 }
      );
    }

    // Links, through the caller's RLS on event_ig_posts (events.view).
    const { data: linkRows, error: linkErr } = await db
      .from('event_ig_posts')
      .select('id, ig_post_id')
      .eq('event_id', eventId);

    if (linkErr) {
      logger.error(MODULE, 'event_ig_posts read failed', linkErr);
      return NextResponse.json(
        {
          success: false,
          error:
            'Could not read this event\'s Instagram links. If this persists, the event_ig_posts table may not be set up yet.',
        },
        { status: 500 }
      );
    }

    const links = (linkRows ?? []) as Array<{ id: string; ig_post_id: string }>;
    const linkIdByPost = new Map(links.map((l) => [l.ig_post_id, l.id]));
    const linkedPostIds = links.map((l) => l.ig_post_id);

    const svc = createServiceRoleClient();

    let linkedPosts: IgPostRow[] = [];
    if (linkedPostIds.length > 0) {
      const { data } = await svc
        .from('ig_posts')
        .select('id, permalink, caption, media_type, posted_at, account_id')
        .in('id', linkedPostIds);
      linkedPosts = (data ?? []) as IgPostRow[];
    }

    // ── Suggestions ─────────────────────────────────────────────────────────
    // Posts on this institution's accounts inside the event's date window.
    // A suggestion is time proximity only — it is NOT evidence the post was
    // about the event, which is why nothing here is ever linked automatically.
    //
    // Matched on INSTITUTION, not department: the events table has no
    // department_id (institution_id only), so department-level narrowing is
    // not available for a general event.
    const window = suggestionWindow(event);
    let suggestionPosts: IgPostRow[] = [];
    if (window && event.institution_id) {
      const { data: acctIds } = await svc
        .from('ig_accounts')
        .select('id')
        .eq('institution_id', event.institution_id);
      const ids = ((acctIds ?? []) as Array<{ id: string }>).map((a) => a.id);
      if (ids.length > 0) {
        const { data } = await svc
          .from('ig_posts')
          .select('id, permalink, caption, media_type, posted_at, account_id')
          .in('account_id', ids)
          .gte('posted_at', window.from)
          .lte('posted_at', window.to)
          .order('posted_at', { ascending: false })
          .limit(SUGGESTION_LIMIT + linkedPostIds.length);
        suggestionPosts = ((data ?? []) as IgPostRow[])
          .filter((p) => !linkIdByPost.has(p.id))
          .slice(0, SUGGESTION_LIMIT);
      }
    }

    const all = [...linkedPosts, ...suggestionPosts];
    const { accounts, metrics } = await hydrate(svc, all);

    const linked = buildPosts(
      linkedPosts,
      accounts,
      metrics,
      linkIdByPost,
      event.institution_id
    );
    const suggestions = buildPosts(
      suggestionPosts,
      accounts,
      metrics,
      new Map(),
      event.institution_id
    );

    const totals = sumReception(linked);
    const body: EventIgReception & { success: true } = {
      success: true,
      linked: linked.sort((a, b) => b.realSignal - a.realSignal),
      totals,
      suggestions,
      caveats: receptionCaveats(totals, window !== null),
    };

    return NextResponse.json(body, { status: 200 });
  } catch (error) {
    logger.error(MODULE, 'GET failed', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load Instagram reception.' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST — link one post from a pasted URL
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
): Promise<NextResponse> {
  const { eventId } = await params;
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Please sign in to link a post.' },
        { status: 401 }
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request body.', code: 'BAD_REQUEST' },
        { status: 400 }
      );
    }

    const igUrl = typeof body?.ig_url === 'string' ? body.ig_url.trim() : '';
    const shortcode = extractIgShortcode(igUrl);
    if (!shortcode) {
      return NextResponse.json(
        {
          success: false,
          error:
            'That does not look like an Instagram post link. Paste the full URL of the post or reel (e.g. https://www.instagram.com/p/ABC123/).',
          code: 'INVALID_IG_URL',
        },
        { status: 422 }
      );
    }

    const db = await createServerSupabaseClient();
    const event = await loadEvent(db, eventId);
    if (!event) {
      return NextResponse.json(
        {
          success: false,
          error:
            "We can't find this event, or you don't have access to it. Ask an event coordinator for access.",
          code: 'EVENT_NOT_VISIBLE',
        },
        { status: 404 }
      );
    }

    // Resolve the URL exactly as AI Pulse does.
    const svc = createServiceRoleClient();
    const { data: igPost, error: igErr } = await svc
      .from('ig_posts')
      .select('id, permalink, account_id')
      .ilike('permalink', `%/${shortcode}/%`)
      .limit(1)
      .maybeSingle();

    if (igErr) {
      logger.error(MODULE, 'ig_posts lookup failed', igErr);
      return NextResponse.json(
        {
          success: false,
          error: 'Could not check that Instagram post. Try again shortly.',
        },
        { status: 500 }
      );
    }

    if (!igPost) {
      return NextResponse.json(
        {
          success: false,
          error:
            "We couldn't find this post on any Instagram account we track. Two common reasons: (1) the post is on an account nobody has connected — only connected institution and department accounts can be linked; (2) it went live in the last hour or so, and our poller has not picked it up yet. Wait a little and try again.",
          code: 'POST_NOT_FOUND',
        },
        { status: 422 }
      );
    }

    // The write. RLS on event_ig_posts is the authority; institution_id is
    // stamped from the event by the table's own trigger, so it is not sent.
    const { data: inserted, error: insertErr } = await db
      .from('event_ig_posts')
      .insert({
        event_id: eventId,
        ig_post_id: (igPost as any).id,
        linked_by: user.id,
      })
      .select('id')
      .maybeSingle();

    if (insertErr) {
      // 23505 = the unique (event_id, ig_post_id) pair. Already linked is not
      // an error the person can act on, so say what happened plainly.
      if ((insertErr as any).code === '23505') {
        return NextResponse.json(
          {
            success: false,
            error: 'That post is already linked to this event.',
            code: 'ALREADY_LINKED',
          },
          { status: 409 }
        );
      }
      // 42501 / RLS denial. Never a silent no-op (house rule #27).
      if (
        (insertErr as any).code === '42501' ||
        /row-level security/i.test((insertErr as any).message ?? '')
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "You don't have permission to link Instagram posts to this event. Ask an administrator for the 'Link Instagram Posts to an Event' permission (events.social.manage).",
            code: 'FORBIDDEN',
          },
          { status: 403 }
        );
      }
      logger.error(MODULE, 'event_ig_posts insert failed', insertErr);
      return NextResponse.json(
        { success: false, error: 'Could not link that post. Try again shortly.' },
        { status: 500 }
      );
    }

    // A successful insert that returns no row means RLS filtered the SELECT
    // back — the link may exist but we cannot confirm it. Say so.
    if (!inserted) {
      return NextResponse.json(
        {
          success: false,
          error:
            'The post could not be confirmed as linked. Reload the event to check before trying again.',
          code: 'UNCONFIRMED',
        },
        { status: 500 }
      );
    }

    // Flag a cross-institution link rather than refusing it: a central handle
    // legitimately covers an individual institution's event.
    const { data: acct } = await svc
      .from('ig_accounts')
      .select('username, institution_id')
      .eq('id', (igPost as any).account_id)
      .maybeSingle();

    const otherInstitution =
      !!event.institution_id &&
      !!(acct as any)?.institution_id &&
      (acct as any).institution_id !== event.institution_id;

    return NextResponse.json(
      {
        success: true,
        link_id: (inserted as any).id,
        permalink: (igPost as any).permalink,
        account_username: (acct as any)?.username ?? null,
        note: otherInstitution
          ? `Linked. Note: @${(acct as any)?.username ?? 'this account'} belongs to a different institution than this event.`
          : null,
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error(MODULE, 'POST failed', error);
    return NextResponse.json(
      { success: false, error: 'Failed to link the post.' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE — unlink
// ---------------------------------------------------------------------------
// Present because a mis-pasted URL would otherwise be permanent: the table has
// no UPDATE path by design, so unlink-and-relink is the only correction.

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
): Promise<NextResponse> {
  const { eventId } = await params;
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Please sign in to unlink a post.' },
        { status: 401 }
      );
    }

    const linkId = request.nextUrl.searchParams.get('link_id');
    if (!linkId) {
      return NextResponse.json(
        { success: false, error: 'link_id is required.', code: 'BAD_REQUEST' },
        { status: 400 }
      );
    }

    const db = await createServerSupabaseClient();
    const { data: deleted, error } = await db
      .from('event_ig_posts')
      .delete()
      .eq('id', linkId)
      .eq('event_id', eventId)
      .select('id');

    if (error) {
      logger.error(MODULE, 'event_ig_posts delete failed', error);
      return NextResponse.json(
        { success: false, error: 'Could not unlink that post.' },
        { status: 500 }
      );
    }

    // RLS turns a forbidden DELETE into 0 rows. That is exactly the silent
    // no-op house rule #27 forbids, so it is reported as a denial.
    if (!deleted || deleted.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Nothing was unlinked — either the link is already gone, or you don't have permission to change this event's Instagram links (events.social.manage).",
          code: 'NOT_DELETED',
        },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    logger.error(MODULE, 'DELETE failed', error);
    return NextResponse.json(
      { success: false, error: 'Failed to unlink the post.' },
      { status: 500 }
    );
  }
}
