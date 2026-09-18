export const dynamic = 'force-dynamic';

// ============================================================================
// POST /api/resource-management/reservations/[id]/comment-mentions
//   body: { comment_id: string, user_ids: string[] }
//
// Tag team members on a reservation comment, and tell them.  [BUG-006139]
//
// Same shape as /api/events/[eventId]/review-mentions:
//
// The TAG is written through the caller's own session. RLS on
// resource_reservation_comment_mentions (only the comment's author, only on a
// thread they can read) and its guard trigger (staff only, reservation pinned
// to the comment's) are the authority — this route does not restate them.
//
// The NOTIFICATION needs the service-role client, because fanoutNotification
// writes user_notifications rows for other people. It runs only for tags the
// session can read back, so a refused tag never notifies anyone. Grant and
// alert are one resumable step (grantAndNotifyTags): a tag whose alert failed
// is finished by the next request for that person — the author's Resend.
//
// Tagging grants the tagged person read access to this booking's thread, and
// only people of the booking's institution can be tagged. Untagging is a
// direct, RLS-checked delete from the browser (no notification to send). See
// supabase/migrations/20261224090000_resource_reservation_comment_mentions.sql
// and 20261224103700_reservation_comment_mentions_same_institution_untag.sql.
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
import { recordFeatureUse, FEATURE_KEYS } from '@/lib/usage/record';

const MOD = 'resource-management/reservation-comment-mentions';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A remark that needs more than this many people is a broadcast, not a tag. */
const MAX_TAGS = 20;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: reservationId } = await params;

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

  if (!UUID.test(reservationId) || !UUID.test(commentId)) {
    return NextResponse.json({ success: false, error: 'Invalid comment.' }, { status: 400 });
  }
  // Tagging yourself notifies nobody and grants nothing you do not already hold.
  const wanted = requested.filter((uid) => uid !== user.id);
  if (wanted.length === 0) {
    return NextResponse.json({ success: true, tagged: [], skipped: [], notified: [] });
  }
  if (wanted.length > MAX_TAGS) {
    return NextResponse.json(
      { success: false, error: `You can tag at most ${MAX_TAGS} people on one comment.` },
      { status: 400 },
    );
  }

  const db = await createServerSupabaseClient();
  const service = createServiceRoleClient();

  // Split out people who cannot be tagged BEFORE the insert: the guard trigger
  // refuses the whole batch on the first one, which would drop every valid tag
  // alongside a single ineligible pick. The rule stays in SQL — this asks the
  // same function the trigger uses (team member of the booking's institution).
  const eligibility = await Promise.all(
    wanted.map(async (uid) => {
      const { data } = await (service as any).rpc('fn_can_be_tagged_on_reservation', {
        p_user_id: uid,
        p_reservation_id: reservationId,
      });
      return { id: uid, ok: data === true };
    }),
  );
  const eligible = eligibility.filter((e) => e.ok).map((e) => e.id);
  const ineligible = eligibility.filter((e) => !e.ok).map((e) => e.id);

  const { data: people } = await (service as any)
    .from('profiles')
    .select('id, full_name')
    .in('id', wanted);
  const names = new Map<string, string>(
    ((people as { id: string; full_name: string | null }[]) ?? []).map((p) => [
      p.id,
      p.full_name?.trim() || 'Unknown',
    ]),
  );

  if (eligible.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: "Only team members of this booking's institution can be tagged.",
        skipped: ineligible.map((uid) => names.get(uid) ?? 'Unknown'),
      },
      { status: 400 },
    );
  }

  // Grant and tell, as one resumable step: a tag whose alert failed earlier is
  // finished here, and an explicit re-tag sends a reminder.
  const outcome = await grantAndNotifyTags({
    db,
    service,
    table: 'resource_reservation_comment_mentions',
    parentColumn: 'reservation_id',
    parentId: reservationId,
    commentId,
    userIds: eligible,
    callerId: user.id,
    keyPrefix: 'reservation-comment-mention',
    buildAlert: async () => {
      const [{ data: reservation }, { data: comment }, { data: me }] = await Promise.all([
        (service as any)
          .from('resource_reservations')
          .select('purpose, resource:resources(name)')
          .eq('id', reservationId)
          .maybeSingle(),
        (service as any)
          .from('resource_reservation_comments')
          .select('body')
          .eq('id', commentId)
          .maybeSingle(),
        (service as any).from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
      ]);

      // Resource name first: "the Seminar Hall booking" is what people recognise.
      const label =
        String(reservation?.resource?.name ?? '').trim() ||
        String(reservation?.purpose ?? '').trim() ||
        'resource';
      const who = me?.full_name?.trim() || 'Someone';
      const excerpt = String(comment?.body ?? '')
        .replace(/\s+/g, ' ')
        .trim();

      return {
        title: `${who} tagged you on a "${label}" booking`,
        body:
          excerpt.length > 240
            ? `${excerpt.slice(0, 237)}…`
            : excerpt || 'You were tagged in a booking comment.',
        url: `/resource-management/reservations/${reservationId}`,
        source: 'resource_reservation_mention',
        metadata: { reservation_id: reservationId, tagged_by: user.id },
      };
    },
  });

  if (outcome.grantError) {
    logger.error(MOD, 'Tag insert refused', {
      reservationId,
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
      reservationId,
      commentId,
      count: outcome.notNotified.length,
      error: outcome.alertError,
    });
  }

  // Adoption loop: count the use only when this call created a tag — repeats
  // and reminders create nothing, and a new tag counts even if its alert is
  // still to be retried. `db` is the session client (auth.uid()); the helper
  // never throws.
  if (outcome.created.length > 0) {
    await recordFeatureUse(db, FEATURE_KEYS.RESOURCES_TAG_COLLEAGUE);
  }

  const toNames = (ids: string[]) => ids.map((uid) => names.get(uid) ?? 'Unknown');
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
