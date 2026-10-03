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
  type ClaimedPostInput,
  type ClaimStatus,
  type IgMetricSnapshot,
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
): Promise<string | null> {
  const { data } = await db.from('profiles').select('learner_id').eq('id', userId).maybeSingle();
  return (data?.learner_id as string | null) ?? null;
}

/**
 * Resolve a pasted link to a post we already hold.
 * Returns the post id, or a message explaining exactly why not.
 */
async function resolvePostOrExplain(
  igUrl: string
): Promise<{ postId: string } | { error: string; status: number }> {
  const parsed = parsePostLink(igUrl);
  if ('reason' in parsed) return { error: parsed.message, status: 400 };

  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from('ig_posts')
    .select('id')
    .ilike('permalink', `%/${parsed.shortcode}/%`)
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error(MODULE, 'post lookup failed', error);
    return { error: 'Could not check that link just now. Try again shortly.', status: 500 };
  }
  if (!data) return { error: postNotOursMessage(parsed.shortcode), status: 404 };
  return { postId: data.id as string };
}

// ---------------------------------------------------------------------------
// GET — the board
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return deny('You are not signed in.', 401);

  const db = await createServerSupabaseClient();
  const admin = createServiceRoleClient();
  const institutionId = req.nextUrl.searchParams.get('institution_id');

  // RLS decides which claims this person may see: their own, or their
  // institution's if they hold social.learner_credit.view.
  let q = db
    .from('ig_learner_post_claims')
    .select('learner_id, ig_post_id, status, institution_id');
  if (institutionId) q = q.eq('institution_id', institutionId);
  const { data: claims, error } = await q;

  if (error) {
    logger.error(MODULE, 'claim read failed', error);
    return deny('Could not read the claims just now.', 500);
  }
  if (!claims || claims.length === 0) {
    return NextResponse.json({
      success: true,
      rows: [],
      caveats: ['No learner has had a post credited yet.'],
    });
  }

  const postIds = Array.from(new Set(claims.map((c) => c.ig_post_id as string)));
  const learnerIds = Array.from(new Set(claims.map((c) => c.learner_id as string)));

  const [{ data: posts }, { data: metrics }, { data: learners }] = await Promise.all([
    admin.from('ig_posts').select('id, account_id').in('id', postIds),
    admin
      .from('ig_post_metrics')
      .select('post_id, snapshot_at, saves, shares, comments')
      .in('post_id', postIds),
    db
      .from('learners_profiles')
      .select('id, first_name, last_name, institution_id')
      .in('id', learnerIds),
  ]);

  const accountIds = Array.from(
    new Set((posts ?? []).map((p) => p.account_id as string).filter(Boolean))
  );
  const { data: accounts } = await admin
    .from('ig_accounts')
    .select('id, metrics_source')
    .in('id', accountIds);

  const sourceByAccount = new Map<string, string | null>(
    (accounts ?? []).map((a) => [a.id as string, (a.metrics_source as string | null) ?? null])
  );
  const sourceByPost = new Map<string, string | null>(
    (posts ?? []).map((p) => [
      p.id as string,
      sourceByAccount.get(p.account_id as string) ?? null,
    ])
  );
  const latestByPost = latestSnapshotByPost((metrics ?? []) as IgMetricSnapshot[]);

  const claimsByLearner = new Map<string, ClaimedPostInput[]>();
  for (const c of claims) {
    const list = claimsByLearner.get(c.learner_id as string) ?? [];
    list.push({
      ig_post_id: c.ig_post_id as string,
      status: c.status as ClaimStatus,
      metrics_source: sourceByPost.get(c.ig_post_id as string) ?? null,
    });
    claimsByLearner.set(c.learner_id as string, list);
  }

  const rows: LearnerCreditRow[] = (learners ?? []).map((l) =>
    buildCreditRow(
      {
        learner_id: l.id as string,
        learner_name: [l.first_name, l.last_name].filter(Boolean).join(' ') || 'Unnamed learner',
        institution_id: (l.institution_id as string) ?? '',
      },
      claimsByLearner.get(l.id as string) ?? [],
      latestByPost
    )
  );

  return NextResponse.json({ success: true, rows, caveats: boardCaveats(rows) });
}

// ---------------------------------------------------------------------------
// POST — file a claim (path 1 learner, path 3 staff)
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return deny('You are not signed in.', 401);

  let body: { ig_url?: string; learner_id?: string };
  try {
    body = await req.json();
  } catch {
    return deny('Send an Instagram post link.', 400);
  }
  if (!body.ig_url) return deny('Send an Instagram post link.', 400);

  const db = await createServerSupabaseClient();
  const mine = await ownLearnerId(db, user.id);

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
  const user = await getAuthUser();
  if (!user) return deny('You are not signed in.', 401);

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
    .select('id, status')
    .maybeSingle();

  if (error) {
    if (error.code === '42501') {
      return deny('You are not allowed to decide that claim.', 403);
    }
    logger.error(MODULE, 'claim decision failed', error);
    return deny(error.message, 400);
  }
  if (!data) {
    return deny('That claim does not exist, or you cannot see it.', 404);
  }

  return NextResponse.json({ success: true, claim: data });
}

// ---------------------------------------------------------------------------
// DELETE — withdraw a pending claim
// ---------------------------------------------------------------------------
export async function DELETE(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return deny('You are not signed in.', 401);

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
