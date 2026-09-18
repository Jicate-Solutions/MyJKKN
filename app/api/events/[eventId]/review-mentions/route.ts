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
// from `authenticated`. It runs only for tags the session can read back, so a
// refused tag can never produce a notification. Grant and alert are one
// resumable step (grantAndNotifyTags): a tag whose alert failed is finished by
// the next request for that person — the author's Resend.
//
// Tagging grants the tagged person read access to this event's review thread
// (fn_can_read_event_review_comments), and only team members of the event's
// institution can be tagged. Untagging is a direct, RLS-checked delete from the
// browser. See supabase/migrations/20261220096000_event_review_comment_mentions.sql
// and 20261224110000_event_review_mentions_same_institution_untag.sql.
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import {
  getAuthUser,
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase/server';
import { grantAndNotifyTags } from '@/lib/services/shared/comment-mention-alerts';
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
    return NextResponse.json(
      { success: false, error: 'Please sign in to tag people.' },
      { status: 401 },
    );
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

  if (!UUID.test(eventId) || !UUID.test(commentId)) {
    return NextResponse.json({ success: false, error: 'Invalid comment.' }, { status: 400 });
  }
  // Tagging yourself notifies nobody and grants nothing you do not already hold.
  const wanted = requested.filter((id) => id !== user.id);
  if (wanted.length === 0) {
    return NextResponse.json({ success: true, tagged: [], skipped: [], notified: [] });
  }
  if (wanted.length > MAX_TAGS) {
    return NextResponse.json(
      {
        success: false,
        error: `You can tag at most ${MAX_TAGS} people on one comment.`,
      },
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
      // Team member of THIS event's institution (20261224110000).
      const { data } = await (service as any).rpc('fn_can_be_tagged_on_event', {
        p_user_id: id,
        p_event_id: eventId,
      });
      return { id, ok: data === true };
    }),
  );
  const eligible = eligibility.filter((e) => e.ok).map((e) => e.id);
  const ineligible = eligibility.filter((e) => !e.ok).map((e) => e.id);

  const nameOf = async (ids: string[]) => {
    if (ids.length === 0) return new Map<string, string>();
    const { data } = await (service as any).from('profiles').select('id, full_name').in('id', ids);
    return new Map<string, string>(
      ((data as { id: string; full_name: string | null }[]) ?? []).map((p) => [
        p.id,
        p.full_name?.trim() || 'Unknown',
      ]),
    );
  };
  const names = await nameOf(wanted);

  if (eligible.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: "Only team members of this event's institution can be tagged — learners never see this thread.",
        skipped: ineligible.map((id) => names.get(id) ?? 'Unknown'),
      },
      { status: 400 },
    );
  }

  // Grant and tell, as one resumable step: a tag whose alert failed earlier is
  // finished here, and an explicit re-tag sends a reminder.
  const outcome = await grantAndNotifyTags({
    db,
    service,
    table: 'event_review_comment_mentions',
    parentColumn: 'event_id',
    parentId: eventId,
    commentId,
    userIds: eligible,
    callerId: user.id,
    keyPrefix: 'event-review-mention',
    buildAlert: async () => {
      const [{ data: event }, { data: comment }, { data: me }] = await Promise.all([
        (service as any).from('events').select('name, event_type').eq('id', eventId).maybeSingle(),
        (service as any)
          .from('event_review_comments')
          .select('body')
          .eq('id', commentId)
          .maybeSingle(),
        (service as any).from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
      ]);

      const eventName = (event?.name ?? 'an event').trim();
      const who = me?.full_name?.trim() || 'Someone';
      const excerpt = String(comment?.body ?? '')
        .replace(/\s+/g, ' ')
        .trim();

      // No `type` column: public.notifications has none (verified 2026-09-16),
      // so the legacy `type: 'events'` envelope is not sent. The events inbox
      // matches metadata.source ('events_review_mention').
      return {
        title: `${who} tagged you on "${eventName}"`,
        body:
          excerpt.length > 240
            ? `${excerpt.slice(0, 237)}…`
            : excerpt || 'You were tagged in a review comment.',
        url:
          event?.event_type === 'sports_tournament'
            ? `/events/tournament/${eventId}`
            : `/events/${eventId}`,
        source: 'events_review_mention',
        metadata: { event_id: eventId, tagged_by: user.id },
      };
    },
  });

  if (outcome.grantError) {
    logger.error(MOD, 'Tag insert refused', {
      eventId,
      commentId,
      code: outcome.grantError.code,
      message: outcome.grantError.message,
    });
    return NextResponse.json(
      {
        success: false,
        error: commentWriteMessage(outcome.grantError, 'tag people on this comment'),
      },
      { status: outcome.grantError.code === '42501' ? 403 : 400 },
    );
  }

  if (outcome.notNotified.length > 0) {
    logger.error(MOD, 'Tagged, but the alert did not go out — Resend will retry', {
      eventId,
      commentId,
      count: outcome.notNotified.length,
      error: outcome.alertError,
    });
  }

  const toNames = (ids: string[]) => ids.map((id) => names.get(id) ?? 'Unknown');
  return NextResponse.json({
    success: true,
    tagged: toNames(outcome.tagged),
    skipped: toNames(ineligible),
    notified: toNames(outcome.notified),
    reminded: toNames(outcome.reminded),
    recently_notified: toNames(outcome.recentlyNotified),
    not_notified: toNames(outcome.notNotified),
  });
}
