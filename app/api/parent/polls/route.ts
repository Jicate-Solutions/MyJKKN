import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveParentScope, assertLearnerAccess, parentErrorResponse } from '@/lib/utils/parent-access';
import type { Poll, PollOption, VotePayload } from '@/types/parent-portal';

export const runtime = 'nodejs';

const isClosed = (closesAt: string | null) => !!closesAt && new Date(closesAt).getTime() < Date.now();

/** GET /api/parent/polls?learnerId=… — active polls for the institution + this child's vote. */
export async function GET(req: NextRequest) {
  try {
    const scope = await resolveParentScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const learnerId = new URL(req.url).searchParams.get('learnerId') ?? '';
    assertLearnerAccess(scope, learnerId);

    const db = createServiceRoleClient();
    const { data: learner } = await db
      .from('learners_profiles')
      .select('institution_id, section_id')
      .eq('id', learnerId)
      .maybeSingle();
    if (!learner?.institution_id) return NextResponse.json({ data: [] });

    const { data: polls } = await db
      .from('pp_polls')
      .select('id, question, options, audience, section_id, closes_at, is_active, created_at')
      .eq('institutions_id', learner.institution_id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    const visible = (polls ?? []).filter(
      (p) => p.audience !== 'section' || p.section_id === learner.section_id
    );
    if (!visible.length) return NextResponse.json({ data: [] });

    // This child's responses + aggregate counts.
    const pollIds = visible.map((p) => p.id);
    const [{ data: mine }, { data: allResp }] = await Promise.all([
      db
        .from('pp_poll_responses')
        .select('poll_id, option_id')
        .eq('parent_account_id', scope.parentAccountId)
        .eq('learner_profile_id', learnerId)
        .in('poll_id', pollIds),
      db.from('pp_poll_responses').select('poll_id, option_id').in('poll_id', pollIds),
    ]);
    const myByPoll = new Map((mine ?? []).map((r) => [r.poll_id, r.option_id]));
    const counts = new Map<string, Record<string, number>>();
    for (const r of allResp ?? []) {
      const m = counts.get(r.poll_id) ?? {};
      m[r.option_id] = (m[r.option_id] ?? 0) + 1;
      counts.set(r.poll_id, m);
    }

    const data: Poll[] = visible.map((p) => {
      const myOptionId = myByPoll.get(p.id);
      const closed = isClosed(p.closes_at) || !p.is_active;
      const results = counts.get(p.id) ?? {};
      const reveal = closed || !!myOptionId; // show tallies once voted or closed
      return {
        id: p.id,
        question: p.question,
        options: (p.options as PollOption[]) ?? [],
        closesAt: p.closes_at ?? undefined,
        isClosed: closed,
        myOptionId,
        results: reveal ? results : undefined,
        totalVotes: Object.values(results).reduce((a, b) => a + b, 0),
      };
    });
    return NextResponse.json({ data });
  } catch (err) {
    return parentErrorResponse(err);
  }
}

/** POST /api/parent/polls — cast a vote { learnerId, pollId, optionId }. */
export async function POST(req: NextRequest) {
  try {
    const scope = await resolveParentScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as Partial<VotePayload>;
    const { learnerId, pollId, optionId } = body;
    if (!learnerId || !pollId || !optionId)
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    assertLearnerAccess(scope, learnerId);

    const db = createServiceRoleClient();
    const { data: poll } = await db
      .from('pp_polls')
      .select('id, institutions_id, closes_at, is_active, options')
      .eq('id', pollId)
      .maybeSingle();
    if (!poll || !poll.is_active || isClosed(poll.closes_at))
      return NextResponse.json({ error: 'Poll is closed' }, { status: 400 });

    const validOption = ((poll.options as PollOption[]) ?? []).some((o) => o.id === optionId);
    if (!validOption) return NextResponse.json({ error: 'Invalid option' }, { status: 400 });

    const { error } = await db.from('pp_poll_responses').upsert(
      {
        institutions_id: poll.institutions_id,
        poll_id: pollId,
        parent_account_id: scope.parentAccountId,
        learner_profile_id: learnerId,
        option_id: optionId,
      },
      { onConflict: 'poll_id,parent_account_id,learner_profile_id' }
    );
    if (error) return NextResponse.json({ error: 'Failed to record vote' }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return parentErrorResponse(err);
  }
}
