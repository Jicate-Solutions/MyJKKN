export const dynamic = 'force-dynamic';

// app/api/learners-council/chat/seed-scope-members/route.ts
// POST /api/learners-council/chat/seed-scope-members — turn a chat channel's
// SCOPE into actual lc_chat_members rows (BUG-04).
//
// WHY this exists: lc_chat_channels visibility is membership-based
// (lc_chat_channels_select = created_by = auth.uid() OR fn_is_lc_chat_member(id),
// migration 20260725180000). CommunicationService.createChannel() only ever
// inserted the creator plus explicitly-passed member_ids, so a channel created
// with type 'executive' / 'chapter' / 'vertical' / 'portfolio' had exactly ONE
// member and was visible to exactly ONE person. The scope was recorded and never
// resolved. This route resolves it.
//
// WHY service-role (same reasoning already written in
// app/api/learners-council/pickers/people/route.ts): a council office bearer may
// hold learners-council.* permissions without learners.* / yuva.*, so the browser
// (anon/RLS) client returns 0 rows for lc_members / yuva_* reads — silently, with
// error === null — and the caller cannot insert lc_chat_members rows for anyone
// but themselves. Reading and writing here under service-role is the only way the
// resolved group actually lands.
//
// WHY that is not a privilege hole:
//   1. session auth is required;
//   2. the caller must be the channel's OWN creator (created_by = auth.uid()) —
//      you can only seed a channel you just made, never someone else's;
//   3. for PER-INSTITUTION scopes (chapter, vertical) the resolved people are
//      re-filtered through the SAME institution scope every other API route
//      uses (createApiInstitutionFilter), so an institution-scoped caller can
//      never pull a person from another college into their channel.
//      super_admin keeps its documented cross-institution bypass.
//      CLUSTER-WIDE scopes (executive, portfolio) are deliberately NOT
//      institution-filtered — there is one Learners Council across all
//      colleges, so filtering it to the creator's college resolves to zero
//      members for most creators. See the note at Step 4.
//
// Idempotent: existing members are read first and only the missing rows are
// inserted, so re-running adds nothing. It does not depend on a unique
// constraint existing on (channel_id, user_id) — no such DDL is in this repo.
//
// "Currently serving" is decided by lc_members.status = 'active' /
// yuva_*.is_active = true — the SAME predicate notifyMembersOfAnnouncement and
// the people picker already use — deliberately NOT by `ended_at IS NULL`. If
// ended_at is stamped with the term's end date at appointment time, an
// ended_at filter would resolve every scope to nobody and the channel would
// still reach only its creator: the bug would survive its own fix, silently.
//
// This route makes NO schema change and does not touch the lc_chat_* RLS
// policies or fn_is_lc_chat_member (PR #2379) — touching those risks
// reintroducing the 42P17 recursion.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import { createApiInstitutionFilter } from '@/lib/auth/api-institution-filter';

/** A person the scope resolved to, with the institution we scope-check them by. */
interface ResolvedPerson {
  user_id: string;
  institution_id: string | null;
}

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

/**
 * Everyone holding an active council seat whose position is in the 'executive'
 * category. Two plain queries rather than an embedded !inner join so there is no
 * ambiguity about which FK the embed resolves through.
 */
async function resolveExecutive(supabase: ServiceClient): Promise<ResolvedPerson[]> {
  const { data: positions, error: posError } = await supabase
    .from('lc_positions')
    .select('id')
    .eq('category', 'executive');

  if (posError) throw new Error(`positions: ${posError.message}`);

  const positionIds = (positions || []).map((p: { id: string }) => p.id);
  if (positionIds.length === 0) return [];

  const { data: members, error: memError } = await supabase
    .from('lc_members')
    .select('user_id, institution_id')
    .eq('status', 'active')
    .in('position_id', positionIds);

  if (memError) throw new Error(`executive members: ${memError.message}`);

  return (members || []) as ResolvedPerson[];
}

/**
 * A YUVA chapter is per-institution (yuva_chapters.institution_id). There is no
 * yuva_chapter_members table in this schema, so a chapter's people are the union
 * of:
 *   (a) yuva_vertical_members rows carrying that chapter_id — the literal
 *       chapter-membership rows. NOTE: this table is empty on production today,
 *       so in practice it contributes nobody; that is real, not an error.
 *   (b) the active lc_members of that chapter's institution — the council people
 *       who actually make up that chapter.
 * Without (b) a chapter channel would resolve to zero people and the bug would
 * survive the fix.
 *
 * reference_id, when the caller supplies one, names the chapter. The create
 * dialog does not yet offer a chapter target, so when it is absent we fall back
 * to the creator's own institution's chapters — the only chapter the UI can
 * currently mean.
 */
async function resolveChapter(
  supabase: ServiceClient,
  referenceId: string | null,
  creatorInstitutionId: string | null
): Promise<ResolvedPerson[]> {
  let chapterQuery = supabase
    .from('yuva_chapters')
    .select('id, institution_id')
    .eq('is_active', true);

  if (referenceId) {
    chapterQuery = chapterQuery.eq('id', referenceId);
  } else if (creatorInstitutionId) {
    chapterQuery = chapterQuery.eq('institution_id', creatorInstitutionId);
  } else {
    return [];
  }

  const { data: chapters, error: chapError } = await chapterQuery;
  if (chapError) throw new Error(`chapters: ${chapError.message}`);

  const chapterRows = (chapters || []) as { id: string; institution_id: string }[];
  if (chapterRows.length === 0) return [];

  const chapterIds = chapterRows.map((c) => c.id);
  const institutionIds = Array.from(new Set(chapterRows.map((c) => c.institution_id)));

  const [verticalMembers, councilMembers] = await Promise.all([
    supabase
      .from('yuva_vertical_members')
      .select('user_id, chapter_id')
      .eq('is_active', true)
      .in('chapter_id', chapterIds),
    supabase
      .from('lc_members')
      .select('user_id, institution_id')
      .eq('status', 'active')
      .in('institution_id', institutionIds),
  ]);

  if (verticalMembers.error) throw new Error(`chapter verticals: ${verticalMembers.error.message}`);
  if (councilMembers.error) throw new Error(`chapter council: ${councilMembers.error.message}`);

  const chapterInstitutionOf = new Map(chapterRows.map((c) => [c.id, c.institution_id]));

  const fromVerticals = ((verticalMembers.data || []) as { user_id: string; chapter_id: string }[]).map(
    (row) => ({
      user_id: row.user_id,
      institution_id: chapterInstitutionOf.get(row.chapter_id) || null,
    })
  );

  return [...fromVerticals, ...((councilMembers.data || []) as ResolvedPerson[])];
}

/**
 * Vertical membership lives in yuva_vertical_members. That table has ZERO rows on
 * production right now, so a vertical-scoped channel legitimately resolves to
 * just its creator until verticals are populated — an empty result here is a
 * true answer, not a failure, and nothing is invented to fill it.
 *
 * When no reference_id names a vertical, we use the verticals the creator
 * themselves belongs to.
 */
async function resolveVertical(
  supabase: ServiceClient,
  referenceId: string | null,
  creatorUserId: string
): Promise<ResolvedPerson[]> {
  let verticalIds: string[];

  if (referenceId) {
    verticalIds = [referenceId];
  } else {
    const { data: own, error: ownError } = await supabase
      .from('yuva_vertical_members')
      .select('vertical_id')
      .eq('user_id', creatorUserId)
      .eq('is_active', true);

    if (ownError) throw new Error(`creator verticals: ${ownError.message}`);
    verticalIds = Array.from(
      new Set(((own || []) as { vertical_id: string }[]).map((v) => v.vertical_id))
    );
  }

  if (verticalIds.length === 0) return [];

  const { data: rows, error } = await supabase
    .from('yuva_vertical_members')
    .select('user_id, chapter_id')
    .eq('is_active', true)
    .in('vertical_id', verticalIds);

  if (error) throw new Error(`vertical members: ${error.message}`);

  const chapterIds = Array.from(
    new Set(((rows || []) as { chapter_id: string }[]).map((r) => r.chapter_id))
  );
  if (chapterIds.length === 0) return [];

  // yuva_vertical_members carries no institution_id; the chapter it hangs off
  // supplies the institution we scope-check by.
  const { data: chapters, error: chapError } = await supabase
    .from('yuva_chapters')
    .select('id, institution_id')
    .in('id', chapterIds);

  if (chapError) throw new Error(`vertical chapters: ${chapError.message}`);

  const institutionOf = new Map(
    ((chapters || []) as { id: string; institution_id: string }[]).map((c) => [c.id, c.institution_id])
  );

  return ((rows || []) as { user_id: string; chapter_id: string }[]).map((row) => ({
    user_id: row.user_id,
    institution_id: institutionOf.get(row.chapter_id) || null,
  }));
}

/**
 * A portfolio is an lc_portfolio_committees row; its people are
 * lc_committee_members (keyed by lc_members.id, NOT by user_id). When no
 * reference_id names a committee we use the committees the creator sits on.
 */
async function resolvePortfolio(
  supabase: ServiceClient,
  referenceId: string | null,
  creatorUserId: string
): Promise<ResolvedPerson[]> {
  let committeeIds: string[];

  if (referenceId) {
    committeeIds = [referenceId];
  } else {
    const { data: creatorSeats, error: seatError } = await supabase
      .from('lc_members')
      .select('id')
      .eq('user_id', creatorUserId)
      .eq('status', 'active');

    if (seatError) throw new Error(`creator seats: ${seatError.message}`);

    const seatIds = ((creatorSeats || []) as { id: string }[]).map((s) => s.id);
    if (seatIds.length === 0) return [];

    const { data: own, error: ownError } = await supabase
      .from('lc_committee_members')
      .select('committee_id')
      .eq('is_active', true)
      .in('member_id', seatIds);

    if (ownError) throw new Error(`creator committees: ${ownError.message}`);
    committeeIds = Array.from(
      new Set(((own || []) as { committee_id: string }[]).map((c) => c.committee_id))
    );
  }

  if (committeeIds.length === 0) return [];

  const { data: seats, error } = await supabase
    .from('lc_committee_members')
    .select('member_id')
    .eq('is_active', true)
    .in('committee_id', committeeIds);

  if (error) throw new Error(`committee members: ${error.message}`);

  const memberIds = Array.from(
    new Set(((seats || []) as { member_id: string }[]).map((s) => s.member_id))
  );
  if (memberIds.length === 0) return [];

  const { data: people, error: peopleError } = await supabase
    .from('lc_members')
    .select('user_id, institution_id')
    .in('id', memberIds);

  if (peopleError) throw new Error(`committee people: ${peopleError.message}`);

  return (people || []) as ResolvedPerson[];
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Step 1: session auth — must be a logged-in user.
  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Step 2: resolve the caller's institution scope (super_admin bypass returns
  // institutionIds: [] meaning "all").
  const filter = await createApiInstitutionFilter(request);
  if (!filter.isAllowed) {
    return NextResponse.json(
      { error: filter.reason || 'Institution access denied' },
      { status: 403 }
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { channel_id?: string };
    const channelId = (body.channel_id || '').trim();

    if (!channelId) {
      return NextResponse.json({ error: 'channel_id is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    const { data: channel, error: channelError } = await supabase
      .from('lc_chat_channels')
      .select('id, type, reference_id, created_by')
      .eq('id', channelId)
      .maybeSingle();

    if (channelError) {
      console.error(
        '[learners-council/chat/seed-scope-members] channel lookup failed:',
        channelError.message
      );
      return NextResponse.json({ error: 'Failed to load channel' }, { status: 500 });
    }

    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    const channelRow = channel as {
      id: string;
      type: string;
      reference_id: string | null;
      created_by: string;
    };

    // Step 3: you may only seed a channel you created yourself.
    if (channelRow.created_by !== user.id) {
      return NextResponse.json(
        { error: 'Only the channel creator can seed its scope' },
        { status: 403 }
      );
    }

    // 'custom' and 'direct' carry no group — their membership is exactly the
    // explicit member_ids the creator chose, which createChannel already wrote.
    if (channelRow.type === 'custom' || channelRow.type === 'direct') {
      return NextResponse.json(
        { resolved: 0, added: 0, scope: channelRow.type },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // The creator's institution is the fallback target for a chapter channel
    // created without an explicit reference_id.
    const { data: creatorProfile } = await supabase
      .from('profiles')
      .select('institution_id')
      .eq('id', user.id)
      .maybeSingle();

    const creatorInstitutionId =
      (creatorProfile as { institution_id: string | null } | null)?.institution_id ?? null;

    let resolved: ResolvedPerson[];
    switch (channelRow.type) {
      case 'executive':
        resolved = await resolveExecutive(supabase);
        break;
      case 'chapter':
        resolved = await resolveChapter(supabase, channelRow.reference_id, creatorInstitutionId);
        break;
      case 'vertical':
        resolved = await resolveVertical(supabase, channelRow.reference_id, user.id);
        break;
      case 'portfolio':
        resolved = await resolvePortfolio(supabase, channelRow.reference_id, user.id);
        break;
      default:
        return NextResponse.json(
          { error: `Unsupported channel scope: ${channelRow.type}` },
          { status: 400 }
        );
    }

    // Step 4: re-impose the caller's institution scope — but ONLY for scopes
    // that are actually per-institution.
    //
    // A YUVA chapter and a vertical belong to one college, so filtering them to
    // the caller's institutions is right: nobody pulls a person from another
    // college into their channel.
    //
    // The council itself is NOT per-institution. There is ONE Learners Council
    // across all colleges — today its President and Secretary sit in Dental and
    // its Vice President in Pharmacy. Filtering an 'executive' or 'portfolio'
    // channel to the creator's own college therefore resolves to ZERO council
    // members for every creator outside those two colleges, which silently
    // reproduces the exact bug this route exists to fix: the channel is created,
    // seeding "succeeds", and still nobody but the creator can see it.
    //
    // These cluster-wide scopes resolve from council membership itself
    // (lc_members / committee membership), which is already the authority on who
    // belongs — an institution filter adds no safety there, only silent misses.
    const CLUSTER_WIDE_SCOPES = new Set(['executive', 'portfolio']);
    const scopeIsClusterWide = CLUSTER_WIDE_SCOPES.has(channelRow.type);

    const allowedInstitutions =
      scopeIsClusterWide || filter.isSuperAdmin || filter.institutionIds.length === 0
        ? null
        : new Set(filter.institutionIds);

    const inScope = new Set(
      resolved
        .filter((person) => {
          if (!person.user_id) return false;
          if (!allowedInstitutions) return true;
          return allowedInstitutions.has(person.institution_id || '');
        })
        .map((person) => person.user_id)
    );

    // Step 5: idempotent diff — read what is already there, insert only the gap.
    const { data: existing, error: existingError } = await supabase
      .from('lc_chat_members')
      .select('user_id')
      .eq('channel_id', channelId);

    if (existingError) {
      console.error(
        '[learners-council/chat/seed-scope-members] member lookup failed:',
        existingError.message
      );
      return NextResponse.json({ error: 'Failed to load channel members' }, { status: 500 });
    }

    const alreadyIn = new Set(((existing || []) as { user_id: string }[]).map((m) => m.user_id));
    const missing = Array.from(inScope).filter((id) => !alreadyIn.has(id));

    if (missing.length === 0) {
      return NextResponse.json(
        { resolved: inScope.size, added: 0, scope: channelRow.type },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const joinedAt = new Date().toISOString();
    const { error: insertError } = await supabase.from('lc_chat_members').insert(
      missing.map((id) => ({
        channel_id: channelId,
        user_id: id,
        role: 'member',
        joined_at: joinedAt,
      }))
    );

    if (insertError) {
      console.error(
        '[learners-council/chat/seed-scope-members] member insert failed:',
        insertError.message
      );
      return NextResponse.json({ error: 'Failed to add channel members' }, { status: 500 });
    }

    return NextResponse.json(
      { resolved: inScope.size, added: missing.length, scope: channelRow.type },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[learners-council/chat/seed-scope-members] error:', err);
    return NextResponse.json({ error: 'Failed to seed channel members' }, { status: 500 });
  }
}
