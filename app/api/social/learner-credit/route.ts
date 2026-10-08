export const dynamic = 'force-dynamic';

// ============================================================================
// /api/social/learner-credit — crediting a learner for a JKKN Instagram post.
//
//   GET                      → the award board: every learner with a confirmed
//                              claim, BOTH numbers side by side, plus its own
//                              caveats. Never a ranking and never a winner.
//   POST { ig_url }          → path 1: the learner claims their own post.
//   POST { ig_url, learner_id } → path 3: a staff member attributes a post.
//   PATCH { claim_id, status, note? } → confirm or reject a claim.
//   DELETE ?claim_id=        → withdraw a pending claim.
//
// Director's rulings, 2026-10-01 22:45: build all three crediting paths; show
// post count AND saves+shares+comments side by side with a HUMAN picking the
// winners; under-18 learners included. Path 2 ('auto_collab') has a column and
// no writer — whether Instagram exposes collaborators is unverified.
//
// ---------------------------------------------------------------------------
// Reused, not reinvented
// ---------------------------------------------------------------------------
//   • URL → ig_posts resolution and the engagement arithmetic come from
//     lib/services/events/event-ig-reception-service (itself the AI Pulse path).
//     ig_post_metrics averages 627 snapshots per post, so the latest-per-post
//     reduce is load-bearing, not a nicety.
//
// ---------------------------------------------------------------------------
// Authority split (deliberate, mirrors the events reception route)
// ---------------------------------------------------------------------------
// Writes go through the SESSION client, so RLS on ig_learner_post_claims is the
// authority. The route never pre-judges a write with its own role check. A
// learner may file and withdraw their own claim; only a holder of
// social.learner_credit.review may decide one, which is enforced by the policy
// and not by this file.
//
// The service-role client reads ONLY Instagram rows (ig_posts, ig_post_metrics,
// ig_accounts). Their RLS needs social.instagram.view, which a learner does not
// hold, so without this a learner could never resolve their own post link.
// Reads are scoped to the single post matching a submitted shortcode, or to the
// posts already claimed.
//
// Failure is always explicit (house rule #27).
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import {
  getAuthUser,
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase/server';
import {
  parsePostLink,
  buildCreditRow,
  boardCaveats,
  latestSnapshotByPost,
  postNotOursMessage,
  ALREADY_CLAIMED,
  NOT_A_POST_LINK,
  type ClaimedPostInput,
  type ClaimStatus,
  type IgMetricSnapshot,
  type CreditSnapshot,
  type LearnerCreditRow,
} from '@/lib/services/social/learner-ig-credit-service';
import { logger } from '@/lib/utils/enhanced-logger';

const MODULE = 'social/learner-credit';

function deny(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

/** The learner this signed-in person IS, or null when they are staff. */
async function ownLearnerId(
  db: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string
): Promise<{ learnerId: string | null } | { failed: true }> {
  const { data, error } = await db.from('profiles').select('learner_id').eq('id', userId).maybeSingle();
  if (error) {
    logger.error(MODULE, 'profile read failed', error);
    return { failed: true };
  }
  return { learnerId: (data?.learner_id as string | null) ?? null };
}

/** Instagram shortcodes are base64url: letters, digits, '-' and '_'. */
const SHORTCODE_CHARS = /^[A-Za-z0-9_-]+$/;

/**
 * Resolve a pasted link to a post we already hold.
 * Returns the post id, or a message explaining exactly why not.
 */
async function resolvePostOrExplain(
  igUrl: string
): Promise<{ postId: string } | { error: string; status: number }> {
  const parsed = parsePostLink(igUrl);
  if ('reason' in parsed) return { error: parsed.message, status: 400 };

  // Anything outside the shortcode alphabet could act as a pattern character
  // ('%', '\\', and '*', which PostgREST treats as '%'), so it is refused here.
  if (!SHORTCODE_CHARS.test(parsed.shortcode)) return { error: NOT_A_POST_LINK, status: 400 };

  // Case-sensitive LIKE with '_' escaped: shortcodes are case-sensitive and
  // often contain '_', which LIKE would otherwise read as "any one character".
  const escaped = parsed.shortcode.replace(/_/g, '\\_');
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from('ig_posts')
    .select('id')
    .like('permalink', `%/${escaped}/%`)
    .limit(2);

  if (error) {
    logger.error(MODULE, 'post lookup failed', error);
    return { error: 'Could not check that link just now. Try again shortly.', status: 500 };
  }
  if (!data || data.length === 0) return { error: postNotOursMessage(parsed.shortcode), status: 404 };
  if (data.length > 1) {
    return {
      error: 'That link matches more than one post we hold, so it cannot be credited automatically. Ask the department to check it.',
      status: 409,
    };
  }
  return { postId: data[0].id as string };
}

// ---------------------------------------------------------------------------
// GET — the board
// ---------------------------------------------------------------------------
/** PostgREST returns at most 1,000 rows a read, so the board reads in pages of that size. */
const CLAIM_PAGE_SIZE = 1000;
/** Hard stop: past this many pages the board refuses rather than undercount. */
const CLAIM_PAGE_LIMIT = 50;

export async function GET(req: NextRequest) {
  // getAuthUser() returns { user, error }, never a bare user. Testing the
  // wrapper object for truthiness is always true, which silently disabled this
  // guard in the first version of this route — caught by the PR-scoped typecheck.
  const { user, error: authError } = await getAuthUser();
  if (authError || !user) return deny('You are not signed in.', 401);

  const db = await createServerSupabaseClient();
  const admin = createServiceRoleClient();
  const institutionId = req.nextUrl.searchParams.get('institution_id');

  // RLS decides which claims this person may see: their own, or their
  // institution's if they hold social.learner_credit.view.
  //
  // Read in pages. PostgREST caps one read at 1,000 rows and says nothing when
  // it does, so a single select undercounts the board once there are more
  // claims than that. A stable order by id keeps pages from overlapping or
  // skipping rows. The hard stop answers 500 rather than show a partial board.
  const claims: Array<Record<string, unknown>> = [];
  let complete = false;
  // Keyset paging on the primary key, not offsets: a claim filed or withdrawn
  // between two page reads can then neither be counted twice nor push another
  // claim across a page boundary and out of the board.
  let afterId: string | null = null;
  const readPage = (size: number) => {
    let q = db
      .from('ig_learner_post_claims')
      .select('id, learner_id, ig_post_id, status, institution_id');
    if (institutionId) q = q.eq('institution_id', institutionId);
    if (afterId) q = q.gt('id', afterId);
    return q.order('id', { ascending: true }).limit(size);
  };
  for (let page = 0; page < CLAIM_PAGE_LIMIT; page += 1) {
    const { data, error } = await readPage(CLAIM_PAGE_SIZE);
    if (error) {
      logger.error(MODULE, 'claim read failed', error);
      return deny('Could not read the claims just now.', 500);
    }
    const pageRows = (data ?? []) as Array<Record<string, unknown>>;
    claims.push(...pageRows);
    if (pageRows.length < CLAIM_PAGE_SIZE) {
      complete = true;
      break;
    }
    afterId = pageRows[pageRows.length - 1].id as string;
  }
  if (!complete) {
    // Every page came back full. One probe tells "exactly at the limit" apart
    // from "more than the limit", so exactly 50,000 claims is not refused.
    const { data: more, error: probeError } = await readPage(1);
    if (probeError) {
      logger.error(MODULE, 'claim read failed', probeError);
      return deny('Could not read the claims just now.', 500);
    }
    if ((more ?? []).length === 0) complete = true;
  }
  if (!complete) {
    logger.error(MODULE, 'claim read stopped at the page limit', {
      pages: CLAIM_PAGE_LIMIT,
      rows: claims.length,
    });
    return deny(
      `There are more than ${(CLAIM_PAGE_SIZE * CLAIM_PAGE_LIMIT).toLocaleString('en-IN')} claims to read, so the board cannot be shown in full. Choose one institution and try again.`,
      500
    );
  }
  if (claims.length === 0) {
    return NextResponse.json({
      success: true,
      rows: [],
      caveats: ['No learner has had a post credited yet.'],
    });
  }

  const postIds = Array.from(new Set(claims.map((c) => c.ig_post_id as string)));
  const learnerIds = Array.from(new Set(claims.map((c) => c.learner_id as string)));

  // The view holds exactly one row per post (its latest snapshot). Reading
  // ig_post_metrics directly returns ~627 rows a post and PostgREST's 1,000-row
  // cap silently cuts it to an arbitrary subset.
  const [
    { data: posts, error: postsError },
    { data: metrics, error: metricsError },
    { data: learners, error: learnersError },
  ] = await Promise.all([
    admin.from('ig_posts').select('id, account_id').in('id', postIds),
    admin
      .from('v_ig_post_latest_metrics')
      .select('post_id, snapshot_at, saves, shares, comments, likes, reach')
      .in('post_id', postIds),
    db
      .from('learners_profiles')
      .select('id, first_name, last_name, institution_id')
      .in('id', learnerIds),
  ]);
  const readError = postsError ?? metricsError ?? learnersError;
  if (readError) {
    logger.error(MODULE, 'board read failed', readError);
    return deny('Could not read the board just now. Try again shortly.', 500);
  }

  const accountIds = Array.from(
    new Set((posts ?? []).map((p) => p.account_id as string).filter(Boolean))
  );
  const { data: accounts, error: accountsError } = await admin
    .from('ig_accounts')
    .select('id, metrics_source')
    .in('id', accountIds);
  if (accountsError) {
    logger.error(MODULE, 'account read failed', accountsError);
    return deny('Could not read the board just now. Try again shortly.', 500);
  }

  const sourceByAccount = new Map<string, string | null>(
    (accounts ?? []).map((a) => [a.id as string, (a.metrics_source as string | null) ?? null])
  );
  const sourceByPost = new Map<string, string | null>(
    (posts ?? []).map((p) => [
      p.id as string,
      sourceByAccount.get(p.account_id as string) ?? null,
    ])
  );
  // latestSnapshotByPost returns the very row objects it was given, so they
  // still carry `likes`; the cast restores the type the shared helper drops.
  const latestByPost = latestSnapshotByPost(
    (metrics ?? []) as CreditSnapshot[]
  ) as Map<string, CreditSnapshot>;

  const claimsByLearner = new Map<string, ClaimedPostInput[]>();
  const institutionByLearner = new Map<string, string>();
  for (const c of claims) {
    institutionByLearner.set(c.learner_id as string, (c.institution_id as string) ?? '');
    const list = claimsByLearner.get(c.learner_id as string) ?? [];
    list.push({
      ig_post_id: c.ig_post_id as string,
      status: c.status as ClaimStatus,
      metrics_source: sourceByPost.get(c.ig_post_id as string) ?? null,
    });
    claimsByLearner.set(c.learner_id as string, list);
  }

  // Rows come from the claims, not from the profiles this person can read, so a
  // claim whose learner profile is hidden from them still shows and still counts.
  const profileById = new Map((learners ?? []).map((l) => [l.id as string, l]));
  let hiddenProfiles = 0;
  const rows: LearnerCreditRow[] = Array.from(claimsByLearner.entries()).map(
    ([learnerId, learnerClaims]) => {
      const l = profileById.get(learnerId);
      if (!l) hiddenProfiles += 1;
      return buildCreditRow(
        {
          learner_id: learnerId,
          learner_name: l
            ? [l.first_name, l.last_name].filter(Boolean).join(' ') || 'Unnamed learner'
            : 'Learner (name not visible to you)',
          institution_id: l
            ? ((l.institution_id as string) ?? '')
            : (institutionByLearner.get(learnerId) ?? ''),
        },
        learnerClaims,
        latestByPost
      );
    }
  );

  const caveats = boardCaveats(rows);
  if (hiddenProfiles > 0) {
    caveats.unshift(
      `${hiddenProfiles} ${hiddenProfiles === 1 ? 'learner is' : 'learners are'} shown without a name, because you can see ${hiddenProfiles === 1 ? 'their claims but not their profile' : 'their claims but not their profiles'}.`
    );
  }

  return NextResponse.json({ success: true, rows, caveats });
}

// ---------------------------------------------------------------------------
// POST — file a claim (path 1 learner, path 3 staff)
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  // getAuthUser() returns { user, error }, never a bare user. Testing the
  // wrapper object for truthiness is always true, which silently disabled this
  // guard in the first version of this route — caught by the PR-scoped typecheck.
  const { user, error: authError } = await getAuthUser();
  if (authError || !user) return deny('You are not signed in.', 401);

  let body: { ig_url?: string; learner_id?: string };
  try {
    body = await req.json();
  } catch {
    return deny('Send an Instagram post link.', 400);
  }
  if (!body.ig_url) return deny('Send an Instagram post link.', 400);

  const db = await createServerSupabaseClient();
  const own = await ownLearnerId(db, user.id);
  if ('failed' in own) return deny('Could not read your account just now. Try again shortly.', 500);
  const mine = own.learnerId;

  // No learner_id given → the signed-in learner is claiming for themselves.
  const learnerId = body.learner_id ?? mine;
  if (!learnerId) {
    return deny(
      'Say which learner this post belongs to. Your own account is not a learner account, so there is nobody to credit.',
      400
    );
  }
  const origin = body.learner_id && body.learner_id !== mine ? 'staff_link' : 'learner_link';

  const resolved = await resolvePostOrExplain(body.ig_url);
  if ('error' in resolved) return deny(resolved.error, resolved.status);

  // RLS is the authority here: a learner may only insert their own learner_id,
  // and attributing somebody else's post needs social.learner_credit.review.
  const { data, error } = await db
    .from('ig_learner_post_claims')
    .insert({
      learner_id: learnerId,
      ig_post_id: resolved.postId,
      origin,
      claimed_by: user.id,
      // institution_id is omitted on purpose. The BEFORE INSERT trigger stamps
      // it from the learner, and BEFORE triggers run ahead of the NOT NULL and
      // RLS WITH CHECK evaluation, so the row is complete and tenant-correct by
      // the time either is tested. Sending a value here would read as though the
      // caller chooses the tenant, which is exactly what the trigger prevents.
    })
    .select('id, status, origin')
    .maybeSingle();

  if (error) {
    if (error.code === '23505' || /duplicate key/i.test(error.message)) {
      return deny(ALREADY_CLAIMED, 409);
    }
    if (error.code === '42501') {
      return deny(
        'You are not allowed to credit that learner. A learner may claim their own post; crediting somebody else needs the review permission.',
        403
      );
    }
    logger.error(MODULE, 'claim insert failed', error);
    return deny(error.message, 400);
  }

  return NextResponse.json({
    success: true,
    claim: data,
    message:
      'Filed. It counts toward nothing until somebody at the department confirms it.',
  });
}

// ---------------------------------------------------------------------------
// PATCH — decide a claim
// ---------------------------------------------------------------------------
export async function PATCH(req: NextRequest) {
  // getAuthUser() returns { user, error }, never a bare user. Testing the
  // wrapper object for truthiness is always true, which silently disabled this
  // guard in the first version of this route — caught by the PR-scoped typecheck.
  const { user, error: authError } = await getAuthUser();
  if (authError || !user) return deny('You are not signed in.', 401);

  let body: { claim_id?: string; status?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return deny('Say which claim, and whether it is confirmed or rejected.', 400);
  }
  if (!body.claim_id) return deny('Say which claim.', 400);
  if (body.status !== 'confirmed' && body.status !== 'rejected') {
    return deny('A claim can only be confirmed or rejected.', 400);
  }

  const db = await createServerSupabaseClient();
  const { data, error } = await db
    .from('ig_learner_post_claims')
    .update({
      status: body.status,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_note: body.note ?? null,
    })
    .eq('id', body.claim_id)
    // A decision is made once. Without this, a second reviewer or a double
    // submit silently overwrites the first decision.
    .eq('status', 'pending')
    .select('id, status')
    .maybeSingle();

  if (error) {
    if (error.code === '23514') {
      return deny('This claim was already decided. A decision is final.', 409);
    }
    if (error.code === '42501') {
      return deny('You are not allowed to decide that claim.', 403);
    }
    logger.error(MODULE, 'claim decision failed', error);
    return deny(error.message, 400);
  }
  if (!data) {
    return deny('This claim was already decided, or you cannot decide it.', 409);
  }

  return NextResponse.json({ success: true, claim: data });
}

// ---------------------------------------------------------------------------
// DELETE — withdraw a pending claim
// ---------------------------------------------------------------------------
export async function DELETE(req: NextRequest) {
  // getAuthUser() returns { user, error }, never a bare user. Testing the
  // wrapper object for truthiness is always true, which silently disabled this
  // guard in the first version of this route — caught by the PR-scoped typecheck.
  const { user, error: authError } = await getAuthUser();
  if (authError || !user) return deny('You are not signed in.', 401);

  const claimId = req.nextUrl.searchParams.get('claim_id');
  if (!claimId) return deny('Say which claim to withdraw.', 400);

  const db = await createServerSupabaseClient();
  const { error, count } = await db
    .from('ig_learner_post_claims')
    .delete({ count: 'exact' })
    .eq('id', claimId);

  if (error) {
    logger.error(MODULE, 'claim withdrawal failed', error);
    return deny(error.message, 400);
  }
  if (!count) {
    return deny(
      'Nothing was withdrawn. A claim can only be withdrawn by the learner who filed it, while it is still waiting.',
      404
    );
  }

  return NextResponse.json({ success: true, withdrawn: claimId });
}
