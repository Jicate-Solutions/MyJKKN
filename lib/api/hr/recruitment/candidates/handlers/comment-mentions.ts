// POST /api/hr/recruitment/candidates/[id]/comments/mentions
//   body: { comment_id: string, user_ids: string[] }
//
// Tag colleagues on a candidate discussion comment, and tell them.
//
// ── Two clients, two jobs (the events/reservation pattern) ─────────────────
// The TAG is written through the caller's own session, so RLS on
// hr_recruitment_comment_mentions (only the comment's author) and its guard
// trigger (active staff only, candidate pinned to the comment's) are the
// authority. This route does not restate those rules and so cannot drift from
// them.
//
// The NOTIFICATION needs the service-role client: fanoutNotification writes
// user_notifications rows for OTHER people, which RLS rightly refuses from
// `authenticated`. It runs only for tags the session can read back, so a
// refused tag can never produce an alert. Grant and alert are one resumable
// step (grantAndNotifyTags) — a tag whose alert failed is finished by the next
// request for that person.
//
// ── What a recruitment tag does NOT do ─────────────────────────────────────
// It grants no access. The candidate's discussion is already readable by
// everyone who can read the candidate, so tagging only addresses the remark and
// sends the alert. That is why there is no eligibility RPC here as there is for
// events: the only rule is "an active staff account", which the guard trigger
// owns. See supabase/migrations/20261225060000_hr_recruitment_comment_mentions.sql.

import { NextResponse, connection, type NextRequest } from 'next/server';

import { createServiceRoleClient } from '@/lib/supabase/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { CookieOptions } from '@supabase/ssr';
import { grantAndNotifyTags } from '@/lib/services/shared/comment-mention-alerts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A remark that needs more than this many people is a broadcast, not a tag. */
const MAX_TAGS = 20;

async function getClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) {
          try { cookieStore.set({ name, value, ...options }); } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try { cookieStore.set({ name, value: '', ...options }); } catch {}
        },
      },
    }
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  const { id: candidateId } = await params;

  const supabase = await getClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Please sign in to tag people.' }, { status: 401 });
  }

  const raw = await request.json().catch(() => null);
  const commentId = typeof raw?.comment_id === 'string' ? raw.comment_id : '';
  const requested: string[] = Array.isArray(raw?.user_ids)
    ? Array.from(
        new Set(
          (raw.user_ids as unknown[]).filter(
            (v): v is string => typeof v === 'string' && UUID.test(v),
          ),
        ),
      )
    : [];

  if (!UUID.test(candidateId) || !UUID.test(commentId)) {
    return NextResponse.json({ error: 'Invalid comment.' }, { status: 400 });
  }

  // Tagging yourself notifies nobody — you are the one writing the remark.
  const wanted = requested.filter((uid) => uid !== user.id);
  if (wanted.length === 0) {
    return NextResponse.json({ tagged: [], notified: [] });
  }
  if (wanted.length > MAX_TAGS) {
    return NextResponse.json(
      { error: `You can tag at most ${MAX_TAGS} people on one comment.` },
      { status: 400 },
    );
  }

  const service = createServiceRoleClient();

  const nameOf = async (ids: string[]) => {
    if (ids.length === 0) return new Map<string, string>();
    const { data } = await (service as any)
      .from('profiles').select('id, full_name').in('id', ids);
    return new Map<string, string>(
      ((data as { id: string; full_name: string | null }[]) ?? []).map((p) => [
        p.id,
        p.full_name?.trim() || 'Unknown',
      ]),
    );
  };
  const names = await nameOf(wanted);

  const outcome = await grantAndNotifyTags({
    db: supabase,
    service,
    table: 'hr_recruitment_comment_mentions',
    parentColumn: 'candidate_id',
    parentId: candidateId,
    commentId,
    userIds: wanted,
    callerId: user.id,
    keyPrefix: 'hr-recruitment-mention',
    buildAlert: async () => {
      const [{ data: candidate }, { data: comment }, { data: me }] = await Promise.all([
        (service as any)
          .from('hr_recruitment_candidates')
          .select('name, role_title')
          .eq('id', candidateId)
          .maybeSingle(),
        (service as any)
          .from('hr_recruitment_candidate_comments')
          .select('comment')
          .eq('id', commentId)
          .maybeSingle(),
        (service as any).from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
      ]);

      const who = me?.full_name?.trim() || 'Someone';
      const candidateName = (candidate?.name ?? 'a candidate').trim();
      const roleTitle = (candidate?.role_title ?? '').trim();
      const excerpt = String(comment?.comment ?? '').replace(/\s+/g, ' ').trim();

      return {
        title: `${who} tagged you on ${candidateName}${roleTitle ? ` — ${roleTitle}` : ''}`,
        body:
          excerpt.length > 240
            ? `${excerpt.slice(0, 237)}…`
            : excerpt || 'You were tagged in a recruitment discussion.',
        url: `/hr/recruitment/candidates/${candidateId}`,
        source: 'hr_recruitment_mention',
        metadata: { candidate_id: candidateId, tagged_by: user.id },
      };
    },
  });

  if (outcome.grantError) {
    console.error('[hr/recruitment/candidates/:id/comments/mentions] tag refused', {
      candidateId,
      commentId,
      code: outcome.grantError.code,
      message: outcome.grantError.message,
    });
    // 42501 is the guard trigger's "not an active staff account" and RLS's
    // "not your comment"; both are refusals, not malformed requests.
    return NextResponse.json(
      {
        error:
          outcome.grantError.code === '42501'
            ? 'You can only tag active staff accounts, on your own comment.'
            : outcome.grantError.message || 'Could not tag people on this comment.',
      },
      { status: outcome.grantError.code === '42501' ? 403 : 400 },
    );
  }

  if (outcome.notNotified.length > 0) {
    console.error('[hr/recruitment/candidates/:id/comments/mentions] tagged, alert not sent', {
      candidateId,
      commentId,
      count: outcome.notNotified.length,
      error: outcome.alertError,
    });
  }

  const toNames = (ids: string[]) => ids.map((uid) => names.get(uid) ?? 'Unknown');
  return NextResponse.json({
    tagged: toNames(outcome.tagged),
    notified: toNames(outcome.notified),
    reminded: toNames(outcome.reminded),
    recently_notified: toNames(outcome.recentlyNotified),
    not_notified: toNames(outcome.notNotified),
  });
}
