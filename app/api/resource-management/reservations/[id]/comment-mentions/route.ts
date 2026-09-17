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
// writes user_notifications rows for other people. It runs only for rows the
// session insert actually created, so a refused tag never notifies anyone.
//
// Tagging grants the tagged person read access to this booking's thread, and
// only people of the booking's institution can be tagged. Untagging is a
// direct, RLS-checked delete from the browser (no notification to send). See
// supabase/migrations/20261224090000_resource_reservation_comment_mentions.sql
// and 20261224100000_reservation_comment_mentions_same_institution_untag.sql.
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

  // Session insert: RLS + trigger decide. ignoreDuplicates, so re-tagging
  // someone already tagged on this comment returns no row — which is exactly
  // what keeps them from being notified twice.
  const { data: inserted, error: insertError } = await (db as any)
    .from('resource_reservation_comment_mentions')
    .upsert(
      eligible.map((uid) => ({
        comment_id: commentId,
        reservation_id: reservationId,
        mentioned_user_id: uid,
      })),
      { onConflict: 'comment_id,mentioned_user_id', ignoreDuplicates: true },
    )
    .select('mentioned_user_id');

  if (insertError) {
    logger.error(MOD, 'Tag insert refused', { reservationId, commentId, error: insertError });
    return NextResponse.json(
      { success: false, error: commentWriteMessage(insertError, 'tag people on this comment') },
      { status: insertError.code === '42501' ? 403 : 400 },
    );
  }

  const newlyTagged = ((inserted as { mentioned_user_id: string }[]) ?? []).map(
    (r) => r.mentioned_user_id,
  );

  let notified = 0;
  let notifyError: string | null = null;
  if (newlyTagged.length > 0) {
    try {
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

      const outcome = await fanoutNotification(service as any, {
        title: `${who} tagged you on a "${label}" booking`,
        body:
          excerpt.length > 240
            ? `${excerpt.slice(0, 237)}…`
            : excerpt || 'You were tagged in a booking comment.',
        userIds: newlyTagged,
        createdBy: user.id,
        source: 'resource_reservation_mention',
        url: `/resource-management/reservations/${reservationId}`,
        // One key per (comment, recipient set): a retried request re-derives the
        // same key and the helper skips it instead of notifying twice.
        idempotencyKey: `reservation-comment-mention:${commentId}:${createHash('sha1')
          .update([...newlyTagged].sort().join(','))
          .digest('hex')}`,
        metadata: {
          reservation_id: reservationId,
          comment_id: commentId,
          tagged_by: user.id,
        },
      });
      notified = outcome.notified;
    } catch (e) {
      // The tags are saved and they are what grants access. A failed
      // notification must not turn that into a 500 — say so instead, so the
      // author knows to tell the person another way.
      notifyError = (e as { message?: string })?.message ?? 'notification failed';
      logger.error(MOD, 'Tagged, but the notification failed', {
        reservationId,
        commentId,
        error: notifyError,
      });
    }
  }

  return NextResponse.json({
    success: true,
    tagged: newlyTagged.map((uid) => names.get(uid) ?? 'Unknown'),
    skipped: ineligible.map((uid) => names.get(uid) ?? 'Unknown'),
    notified,
    notify_error: notifyError,
  });
}
