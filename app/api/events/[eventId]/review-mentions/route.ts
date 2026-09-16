export const dynamic = 'force-dynamic';

// ============================================================================
// POST /api/events/[eventId]/review-mentions
//   body: { comment_id: string, user_ids: string[] }
//
// Tag staff on an event review comment, and tell them.
//
// ── Two clients, two jobs ─────────────────────────────────────────────────
// The TAG is written through the caller's own session. RLS on
// event_review_comment_mentions (only the comment's author, only on a thread
// they can read) and its guard trigger (staff only, event pinned to the
// comment's) are the authority — this route does not restate them, so it
// cannot drift from them.
//
// The NOTIFICATION needs the service-role client, because fanoutNotification
// writes user_notifications rows for other people and RLS rightly refuses that
// from `authenticated`. It runs only for rows the session insert actually
// created, so a refused tag can never produce a notification.
//
// Tagging grants the tagged person read access to this event's review thread
// (fn_can_read_event_review_comments) — see
// supabase/migrations/20261220096000_event_review_comment_mentions.sql.
// ============================================================================

import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import {
  getAuthUser,
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase/server';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';
import { commentWriteMessage } from '@/lib/services/shared/comment-threads';
import { logger } from '@/lib/utils/enhanced-logger';

const MOD = 'events/review-mentions';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A remark that needs more than this many people is a broadcast, not a tag. */
const MAX_TAGS = 20;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<NextResponse> {
  const { eventId } = await params;

  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ success: false, error: 'Please sign in to tag people.' }, { status: 401 });
  }

  const raw = await request.json().catch(() => null);
  const commentId = typeof raw?.comment_id === 'string' ? raw.comment_id : '';
  const requested: string[] = Array.isArray(raw?.user_ids)
    ? Array.from(new Set((raw.user_ids as unknown[]).filter((v): v is string => typeof v === 'string' && UUID.test(v))))
    : [];

  if (!UUID.test(eventId) || !UUID.test(commentId)) {
    return NextResponse.json({ success: false, error: 'Invalid comment.' }, { status: 400 });
  }
  // Tagging yourself notifies nobody and grants nothing you do not already hold.
  const wanted = requested.filter((id) => id !== user.id);
  if (wanted.length === 0) {
    return NextResponse.json({ success: true, tagged: [], skipped: [], notified: 0 });
  }
  if (wanted.length > MAX_TAGS) {
    return NextResponse.json(
      { success: false, error: `You can tag at most ${MAX_TAGS} people on one comment.` },
      { status: 400 },
    );
  }

  const db = await createServerSupabaseClient();
  const service = createServiceRoleClient();

  // Split out people who cannot be tagged BEFORE the insert. The guard trigger
  // would refuse them anyway, but it refuses the whole batch on the first one —
  // which would drop every valid tag alongside a single learner. The rule
  // itself stays in SQL: this asks the same function the trigger uses.
  const eligibility = await Promise.all(
    wanted.map(async (id) => {
      const { data } = await (service as any).rpc('fn_can_be_tagged_in_event_review', { p_user_id: id });
      return { id, ok: data === true };
    }),
  );
  const eligible = eligibility.filter((e) => e.ok).map((e) => e.id);
  const ineligible = eligibility.filter((e) => !e.ok).map((e) => e.id);

  const nameOf = async (ids: string[]) => {
    if (ids.length === 0) return new Map<string, string>();
    const { data } = await (service as any).from('profiles').select('id, full_name').in('id', ids);
    return new Map<string, string>(
      ((data as { id: string; full_name: string | null }[]) ?? []).map((p) => [p.id, p.full_name?.trim() || 'Unknown']),
    );
  };
  const names = await nameOf(wanted);

  if (eligible.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: 'Only staff can be tagged in review comments — learners never see this thread.',
        skipped: ineligible.map((id) => names.get(id) ?? 'Unknown'),
      },
      { status: 400 },
    );
  }

  // Session insert: RLS + trigger decide. ON CONFLICT DO NOTHING, so re-tagging
  // someone already tagged on this comment is a no-op and returns no row —
  // which is exactly what keeps them from being notified twice.
  const { data: inserted, error: insertError } = await (db as any)
    .from('event_review_comment_mentions')
    .upsert(
      eligible.map((id) => ({ comment_id: commentId, event_id: eventId, mentioned_user_id: id })),
      { onConflict: 'comment_id,mentioned_user_id', ignoreDuplicates: true },
    )
    .select('mentioned_user_id');

  if (insertError) {
    logger.error(MOD, 'Tag insert refused', { eventId, commentId, error: insertError });
    return NextResponse.json(
      { success: false, error: commentWriteMessage(insertError, 'tag people on this comment') },
      { status: insertError.code === '42501' ? 403 : 400 },
    );
  }

  const newlyTagged = ((inserted as { mentioned_user_id: string }[]) ?? []).map((r) => r.mentioned_user_id);

  let notified = 0;
  if (newlyTagged.length > 0) {
    const [{ data: event }, { data: comment }, { data: me }] = await Promise.all([
      (service as any).from('events').select('name, event_type').eq('id', eventId).maybeSingle(),
      (service as any).from('event_review_comments').select('body').eq('id', commentId).maybeSingle(),
      (service as any).from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
    ]);

    const eventName = (event?.name ?? 'an event').trim();
    const who = me?.full_name?.trim() || 'Someone';
    const excerpt = String(comment?.body ?? '').replace(/\s+/g, ' ').trim();
    const url =
      event?.event_type === 'sports_tournament' ? `/events/tournament/${eventId}` : `/events/${eventId}`;

    const outcome = await fanoutNotification(service as any, {
      title: `${who} tagged you on "${eventName}"`,
      body: excerpt.length > 240 ? `${excerpt.slice(0, 237)}…` : excerpt || 'You were tagged in a review comment.',
      userIds: newlyTagged,
      createdBy: user.id,
      source: 'events_review_mention',
      url,
      // One key per (comment, recipient set): a retried request re-derives the
      // same key and the helper skips it instead of notifying twice.
      idempotencyKey: `event-review-mention:${commentId}:${createHash('sha1')
        .update([...newlyTagged].sort().join(','))
        .digest('hex')}`,
      metadata: { event_id: eventId, comment_id: commentId, tagged_by: user.id },
      // Same envelope as the module's other notifications so the events inbox
      // read path picks it up unchanged.
      extraColumns: { type: 'events' },
    });
    notified = outcome.notified;
  }

  return NextResponse.json({
    success: true,
    tagged: newlyTagged.map((id) => names.get(id) ?? 'Unknown'),
    skipped: ineligible.map((id) => names.get(id) ?? 'Unknown'),
    notified,
  });
}
